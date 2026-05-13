/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  increment, 
  getDoc,
  serverTimestamp,
  getDocFromServer 
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { 
  ChevronRight, 
  ChevronLeft,
  Sparkles,
  Plane,
  Compass,
  Trophy,
  Rocket,
  RefreshCcw,
  Users
} from 'lucide-react';

// --- Firebase Initialization ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Validate connection to Firestore
async function testConnection() {
  try {
    // Only testing read access to counters/test_connection
    await getDocFromServer(doc(db, 'counters', 'test_connection'));
    console.log("Firestore connection verified.");
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration: client is offline.");
    } else {
      console.log("Firestore connection test status:", error);
    }
  }
}
testConnection();

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null, // Add actual auth logic if needed
      email: null,
      emailVerified: null,
      isAnonymous: null,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // Not throwing here to allow the app to keep running but log to console
}

// --- Constants & Data ---

const QUESTIONS = [
  { id: 1, text: "나는 현재 맡은 업무에 대해 새로운 관점이 필요하다고 느낀 적이 있다.", category: "성장" },
  { id: 2, text: "나는 언어적 한계를 넘어, 현지의 시장과 고객, 일하는 방식을 직접 경험해보고 싶다.", category: "도전" },
  { id: 3, text: "나는 해외 사례를 보며 '우리 조직에도 적용해보고 싶다'는 상상을 종종 한다.", category: "적용" },
  { id: 4, text: "나는 새로운 환경에 나를 던졌을 때 얻게 될 자극이 두렵기보다 궁금하다.", category: "태도" },
  { id: 5, text: "나는 완벽한 성과보다 '과정에서 배우는 즐거움'을 더 중요하게 생각한다.", category: "가치" },
  { id: 6, text: "나는 내가 얻은 '보석 같은 인사이트'를 동료들에게 적극적으로 공유할 준비가 되어 있다.", category: "공유" },
  { id: 8, text: "나는 낯선 문화와 사람들을 만나는 것이 나의 성장에 큰 동력이 될 것이라 믿는다.", category: "연결" },
  { id: 9, text: "나는 지금의 안정적인 성과에 안주하기보다 한 단계 더 점프하고 싶다.", category: "성장" },
  { id: 10, text: "나는 회사가 제공하는 기회를 통해 '나만의 전문성'을 단단히 다지고 싶다.", category: "전문성" },
  { id: 12, text: "나는 지금의 나에게 필요한 것이 더 많은 정보가 아니라, 직접 부딪혀보는 경험일 수 있다고 느낀다.", category: "실행" }
];

// --- Components ---

function DiagnosisCounter() {
  const [count, setCount] = useState<number | null>(() => {
    // Try to get cached count to avoid loading state flicker
    const cached = sessionStorage.getItem('diagnosis_count');
    return cached ? parseInt(cached, 10) : null;
  });

  useEffect(() => {
    console.log("Starting DiagnosisCounter listener (Completions)...");
    const counterDoc = doc(db, 'counters', 'diagnosis_completions');
    
    const unsubscribe = onSnapshot(counterDoc, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const val = data.count;
        setCount(val);
        sessionStorage.setItem('diagnosis_count', val.toString());
      } else {
        setCount(0);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'counters/diagnosis_completions');
    });

    return () => unsubscribe();
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="bg-white/95 backdrop-blur-md px-4 py-2 rounded-full border border-indigo-200 shadow-xl flex items-center gap-2 pointer-events-auto"
    >
      <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
      <Users size={14} className="text-indigo-500" />
      <span className="text-sm font-bold text-slate-800">
        현재 <span className="text-indigo-600 font-black">{count !== null ? count.toLocaleString() : '...'}</span>명이 진단 완료(집계중)
      </span>
    </motion.div>
  );
}

export default function App() {
  const [step, setStep] = useState<'home' | 'quiz' | 'result'>('home');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [direction, setDirection] = useState(0);
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [showAdminCounter, setShowAdminCounter] = useState(false);

  useEffect(() => {
    // Increment visitors count on mount
    const visitorsRef = doc(db, 'counters', 'total_visitors');
    
    const incrementVisitor = async () => {
      try {
        const snap = await getDoc(visitorsRef);
        if (snap.exists()) {
          await updateDoc(visitorsRef, {
            count: increment(1),
            updatedAt: serverTimestamp()
          });
          console.log("Visitor count incremented");
        } else {
          await setDoc(visitorsRef, {
            count: 1,
            updatedAt: serverTimestamp()
          });
          console.log("Visitor count initialized to 1");
        }
      } catch (err) {
        console.error("Visitor count tracking error:", err);
      }
    };

    incrementVisitor();
  }, []);

  const handleNext = (val: boolean) => {
    const updatedAnswers = [...answers];
    updatedAnswers[currentIdx] = val;
    setAnswers(updatedAnswers);
    
    if (currentIdx < QUESTIONS.length - 1) {
      setDirection(1);
      setCurrentIdx(currentIdx + 1);
    } else {
      setStep('result');
      // Increment completion counter in Firestore
      const counterRef = doc(db, 'counters', 'diagnosis_completions');
      updateDoc(counterRef, {
        count: increment(1),
        updatedAt: serverTimestamp()
      }).catch(err => {
        handleFirestoreError(err, OperationType.UPDATE, 'counters/diagnosis_completions');
        // If document doesn't exist, try creating it
        setDoc(counterRef, { count: 1, updatedAt: serverTimestamp() }, { merge: true })
          .catch(e => handleFirestoreError(e, OperationType.WRITE, 'counters/diagnosis_completions'));
      });
    }
  };

  const handleBack = () => {
    if (currentIdx > 0) {
      setDirection(-1);
      setCurrentIdx(currentIdx - 1);
    }
  };

  const resetQuiz = () => {
    setStep('home');
    setCurrentIdx(0);
    setAnswers([]);
    setDirection(0);
    setShowContactInfo(false);
  };

  const score = answers.filter(a => a).length;
  const resultInfo = useMemo(() => {
    const reviewUrl = "http://smile.bing.co.kr/myoffice/ezBoardSTD/BoardItemView_Cross.aspx?ShowAdjacent=&ItemID={FB6FE912-991D-4B00-B0FD-91D28D6231CB}&BoardID={01d1bffc-8797-68b2-c539-5c1bf48f299c}&location=GENERAL";
    const applyUrl = "http://smile.bing.co.kr/myoffice/ezBoardSTD/BoardItemView_Cross.aspx?ShowAdjacent=&ItemID={F614DC6F-62EE-438D-BD35-05A4181D45BC}&BoardID={01d1bffc-8797-68b2-c539-5c1bf48f299c}&location=GENERAL";

    if (score <= 3) {
      return {
        icon: <Compass className="w-20 h-20 text-blue-500" />,
        title: "지금은 성장의\n'예비 항로'를 탐색 중!",
        description: "현재 직무에서 탄탄한 기초를 다지고 있는 시기이군요~!\n당장 떠나지 않아도 괜찮습니다. 글로벌 인사이트는 멀리 있지 않아요 :)\n지난 빙글로드 연수 후기를 가볍게 읽어보는 것부터 시작해볼까요?",
        ctas: ["동료 후기 확인", "지원 꿀팁 문의"],
        primaryUrl: reviewUrl
      };
    } else if (score <= 6) {
      return {
        icon: <Trophy className="w-20 h-20 text-amber-500" />,
        title: "훌륭한 '성장 엔진'이\n예열되었어요!",
        description: "마음 속에 성장을 향한 뜨거운 에너지가 느껴집니다.\n'내가 잘할 수 있을까?'라는 고민만 덜어낸다면\n당신은 어디서든 빛날 전문가입니다.\n동료들의 빙글로드 후기를 확인하며 용기를 얻어보세요!",
        ctas: ["동료 후기 확인", "지원 꿀팁 문의"],
        primaryUrl: reviewUrl
      };
    } else {
      return {
        icon: <Rocket className="w-20 h-20 text-indigo-600" />,
        title: "준비는 끝났다,\n이제 '이륙'할 시간!",
        description: "도전 정신과 통찰력, 실행의지까지 모두 갖춘 완벽한 후보자입니다!\n당신은 이미 새로운 세상을 경험할 모든 자격을 갖추었습니다.\n망설이지 말고 지금 바로 지원서를 열어보세요!",
        ctas: ["모집 공고 확인", "지원 꿀팁 문의"],
        primaryUrl: applyUrl
      };
    }
  }, [score]);

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans relative overflow-hidden">
      {/* Background Animated Gradient */}
      <div className="fixed inset-0 pointer-events-none opacity-20">
        <motion.div 
          animate={{
            scale: [1, 1.2, 1],
            rotate: [0, 90, 0],
            x: [0, 50, 0],
            y: [0, -50, 0],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute -top-1/4 -right-1/4 w-[80vw] h-[80vw] bg-indigo-200 rounded-full blur-[100px]"
        />
        <motion.div 
          animate={{
            scale: [1, 1.1, 1],
            rotate: [0, -90, 0],
            x: [0, -40, 0],
            y: [0, 30, 0],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-1/4 -left-1/4 w-[60vw] h-[60vw] bg-pink-100 rounded-full blur-[80px]"
        />
      </div>

      <AnimatePresence mode="wait">
        {/* --- Home Scene --- */}
        {step === 'home' && (
          <motion.div 
            key="home"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            className="relative z-10 min-h-screen flex flex-col items-center justify-center p-6 text-center"
          >
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 3, repeat: Infinity }}
                className="mb-8 p-4 bg-indigo-50 rounded-3xl"
              >
                <Plane className="w-16 h-16 text-indigo-600 rotate-45" />
              </motion.div>
              
              <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-6 leading-tight">
                <span className="block mb-2">
                  {"당신은 지금,".split("").map((char, index) => (
                    <motion.span
                      key={`first-${index}`}
                      initial={{ scale: 1 }}
                      animate={{ scale: [1, 1.25, 1] }}
                      transition={{ 
                        duration: 0.6,
                        delay: 1.0 + (index * 0.07),
                        ease: "easeInOut",
                        repeat: 0
                      }}
                      style={{ display: "inline-block" }}
                    >
                      {char === " " ? "\u00A0" : char}
                    </motion.span>
                  ))}
                </span>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-orange-500 inline-block">
                  {"도전할 준비가 되었나요?".split("").map((char, index) => (
                    <motion.span
                      key={`second-${index}`}
                      initial={{ scale: 1, opacity: 1 }}
                      animate={{ scale: [1, 1.25, 1] }}
                      transition={{ 
                        duration: 0.6,
                        delay: 1.45 + (index * 0.07), // Seamless connection from first line
                        ease: "easeInOut"
                      }}
                      style={{ 
                        display: "inline-block",
                        WebkitBackgroundClip: "text", // Ensure clip is stable
                        backgroundClip: "text"
                      }}
                    >
                      {char === " " ? "\u00A0" : char}
                    </motion.span>
                  ))}
                </span>
              </h1>
              
              <p className="text-lg md:text-xl text-slate-500 max-w-xl mx-auto mb-10 leading-relaxed font-bold">
                2026 빙글로드(BinglRoad),<br />
                나에게 정말 필요한 기회일까?<br />
                10가지 질문으로 나의 &#39;도전 마인드셋&#39;을 진단해 보세요!
              </p>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setStep('quiz')}
                className="group relative px-10 py-5 bg-indigo-600 text-white rounded-full font-bold text-xl transition-all shadow-lg shadow-indigo-200 overflow-hidden"
              >
                <span className="relative z-10 flex items-center gap-2">
                  테스트 시작하기 <ChevronRight className="group-hover:translate-x-1 transition-transform" />
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-red-500 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity" />
              </motion.button>

              <p className="mt-8 text-sm text-slate-400 font-medium">소요 시간 : 약 1분</p>
            </motion.div>
        )}

        {/* --- Quiz Scene --- */}
        {step === 'quiz' && (
          <motion.div 
            key="quiz"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 min-h-screen flex flex-col p-6 pt-16 max-w-2xl mx-auto"
          >
            {/* Header & Progress */}
            <div className="mb-12">
              <div className="flex justify-between items-end mb-4">
                <span className="text-indigo-600 font-bold text-sm tracking-widest uppercase">
                   Step {currentIdx + 1} of {QUESTIONS.length}
                </span>
                <span className="text-slate-400 text-xs">{Math.round(((currentIdx + 1) / QUESTIONS.length) * 100)}% Complete</span>
              </div>
              <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${((currentIdx + 1) / QUESTIONS.length) * 100}%` }}
                  className="h-full bg-gradient-to-r from-indigo-600 to-purple-500 rounded-full"
                />
              </div>
            </div>

            {/* Question Card */}
            <div className="flex-grow flex flex-col justify-center relative overflow-hidden min-h-[300px]">
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={currentIdx}
                  custom={direction}
                  variants={{
                    enter: (d: number) => ({ x: d > 0 ? 300 : -300, opacity: 0 }),
                    center: { x: 0, opacity: 1 },
                    exit: (d: number) => ({ x: d > 0 ? -300 : 300, opacity: 0 })
                  }}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="bg-white p-8 md:p-12 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-100/50"
                >
                  <div className="mb-6 flex gap-2">
                    <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold uppercase tracking-wider">
                      {QUESTIONS[currentIdx].category}
                    </span>
                  </div>
                  <h2 className="text-2xl md:text-3xl font-bold leading-snug mb-2 text-slate-800">
                    {QUESTIONS[currentIdx].text}
                  </h2>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Choices */}
            <div className="py-8 grid grid-cols-2 gap-4">
              <motion.button
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleNext(true)}
                className="py-6 rounded-3xl bg-indigo-600 text-white font-bold text-xl shadow-lg shadow-indigo-100 flex flex-col items-center gap-2"
              >
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">O</div>
                그렇다
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleNext(false)}
                className="py-6 rounded-3xl bg-slate-100 text-slate-700 font-bold text-xl hover:bg-slate-200 transition-colors flex flex-col items-center gap-2"
              >
                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">X</div>
                아니다
              </motion.button>
            </div>

            {/* Navigation */}
            <div className="pb-8">
              <button 
                onClick={handleBack}
                disabled={currentIdx === 0}
                className={`flex items-center gap-2 text-sm font-medium transition-opacity ${currentIdx === 0 ? 'opacity-0' : 'opacity-100 text-slate-400 hover:text-indigo-600'}`}
              >
                <ChevronLeft size={16} /> 이전 질문으로
              </button>
            </div>
          </motion.div>
        )}

        {/* --- Result Scene --- */}
        {step === 'result' && (
          <motion.div 
            key="result"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative z-10 min-h-screen flex items-center justify-center p-6"
          >
            <div className="max-w-3xl w-full bg-white rounded-[3rem] p-8 md:p-16 border border-slate-50 shadow-2xl overflow-hidden relative">
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-red-500 via-orange-400 to-yellow-400" />
              
              <div className="flex flex-col items-center text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", duration: 0.8 }}
                  className="mb-8"
                >
                  {resultInfo.icon}
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <p className="text-indigo-600 font-bold tracking-widest text-2xl mb-3">빙글로드 도전 지수 : {Math.round(score/10*100)}점</p>
                  <h2 className="text-3xl md:text-5xl font-black mb-6 leading-tight whitespace-pre-line">
                    {resultInfo.title}
                  </h2>
                  <p className="text-slate-500 text-lg md:text-xl leading-relaxed mb-12 max-w-2xl mx-auto whitespace-pre-line">
                    {resultInfo.description}
                  </p>
                </motion.div>

                <motion.div 
                  className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-lg"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                >
                  {resultInfo.ctas.map((cta, i) => {
                    const isPrimaryBtn = i === 0;
                    const isTipsBtn = cta === "지원 꿀팁 문의";
                    
                    return (
                      <motion.button
                        key={i}
                        whileHover={{ y: -5 }}
                        onClick={() => {
                          if (isPrimaryBtn) {
                            window.open(resultInfo.primaryUrl, '_blank');
                          } else if (isTipsBtn) {
                            setShowContactInfo(true);
                          }
                        }}
                        className={`py-5 px-8 rounded-2xl font-bold transition-all text-lg ${
                          i === 0 
                          ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100' 
                          : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-2 border-slate-100'
                        }`}
                      >
                        {cta}
                      </motion.button>
                    );
                  })}
                </motion.div>

                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1 }}
                  onClick={resetQuiz}
                  className="mt-10 text-slate-400 hover:text-indigo-600 text-sm font-medium flex items-center gap-2"
                >
                  <RefreshCcw size={14} /> 다시 진단해보기
                </motion.button>
              </div>
            </div>

            {/* Contact Info Modal Overlay */}
            <AnimatePresence>
              {showContactInfo && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowContactInfo(false)}
                  className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6"
                >
                  <motion.div
                    initial={{ scale: 0.9, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.9, y: 20 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl"
                  >
                    <h4 className="text-xl font-bold mb-4">문의 연락처</h4>
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 mb-6">
                      <p className="text-indigo-600 font-bold text-lg mb-1">인재육성팀 전한빈 프로</p>
                      <p className="text-slate-500 font-mono text-xl tracking-wider">(6123)</p>
                    </div>
                    <button 
                      onClick={() => setShowContactInfo(false)}
                      className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold"
                    >
                      확인
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Diagnosis Counter - Only visible for Admin toggle */}
      {showAdminCounter && (
        <div className="fixed top-0 left-0 z-[100] p-6 pointer-events-none">
          <DiagnosisCounter />
        </div>
      )}

      {/* Admin Button at the bottom */}
      <div className="fixed bottom-0 left-0 w-full flex justify-center p-2 z-[90] pointer-events-none">
        <button 
          onClick={() => setShowAdminCounter(!showAdminCounter)}
          className="pointer-events-auto bg-transparent hover:bg-slate-50 text-slate-200 hover:text-slate-400 text-[8px] px-2 py-1 rounded transition-all tracking-tighter"
        >
          ADMIN
        </button>
      </div>

      {/* Floating Sparkle Elements removed as per request */}
    </div>
  );
}

