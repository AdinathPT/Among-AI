import { Check, Clock, SkipForward, User, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import CrewMateIcon from './CrewMateIcon';
import { motion, AnimatePresence } from 'framer-motion';
import VoteChat from './voteChat';
export interface PlayerData {
  id: string; // Unique name
  color: string;
  isDead: boolean;
  isMe: boolean;
  votes: number;
}
export interface TYPESMessage {
  sender: string;
  text: string;
  color: string;
  isMe: boolean;
}
interface TYPESMeetingModal {
  isOpen: boolean;
  onClose: () => void;
  initialPlayers: PlayerData[];
}
export default function MeetingModal({
  isOpen,
  onClose,
  initialPlayers,
}: TYPESMeetingModal) {
  const [phase, setPhase] = useState<'Discussion' | 'Voting' | 'Results'>(
    'Discussion',
  );
  const [players, setPlayers] = useState(initialPlayers); // This is just the initial state
  const [messages, setMessages] = useState<TYPESMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [selectedVote, setSelectedVote] = useState<string | null>(null);
  const [confirmedVote, setConfirmedVote] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(30);

  //  Sync players and reset state whenever a NEW meeting starts
  useEffect(() => {
    if (!isOpen) return;
    queueMicrotask(() => {
      setPlayers(initialPlayers);
      setMessages([]);
      setPhase('Discussion');
      // setTimeLeft(100);
      setSelectedVote(null);
    });
  }, [isOpen, initialPlayers]);

  // FIX 2: Consolidated Timer & Phase Manager
  useEffect(() => {
    if (!isOpen || phase === 'Results') return;

    const delay = timeLeft > 0 ? 1000 : 0;

    const timer = setTimeout(() => {
      if (timeLeft > 0) {
        setTimeLeft(timeLeft - 1);
      } else {
        // Handle transitions when clock hits zero
        if (phase === 'Discussion') {
          setPhase('Voting');
          setTimeLeft(30);
        } else if (phase === 'Voting') {
          setPhase('Results');
          console.log('CONFIRMED VOTES:', confirmedVote);

          // Wait 5 seconds to show the final results,
          setTimeout(() => {
            onClose();
          }, 2000);
        }
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [isOpen, phase, timeLeft, onClose, confirmedVote]);
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const myData = players.find((p) => p.isMe); // Find your color!

    const newMessage: TYPESMessage = {
      sender: 'YOU',
      text: chatInput,
      color: myData?.color || '#ff0000',
      isMe: true,
    };

    setMessages((prev) => [...prev, newMessage]);
    setChatInput('');
  };
  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center backdrop-blur-sm py-20">
      <div className="flex h-full w-[60vw] flex-col rounded-xl border border-slate-700 bg-slate-900/50 text-slate-200 shadow-2xl">
        <div className="flex items-center justify-center border-b w-full border-slate-700 p-4 rounded-t-xl">
          <h2 className="text-2xl font-bold uppercase tracking-widest text-red-500">
            Emergency Meeting
          </h2>
          <div
            className={`flex items-center gap-2 rounded-md px-3 py-1 transition-colors duration-300 ${timeLeft <= 10 && timeLeft > 0 ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-slate-700 text-slate-200'}`}
          >
            <Clock size={20} />

            <span className="w-full text-center">
              Time left for {phase}:{timeLeft}
            </span>
          </div>
        </div>
        <h3 className="mb-4 text-slate-400 font-semibold flex items-center gap-2">
          <User size={18} /> Chat Room
        </h3>
        <VoteChat
          messages={messages}
          chatInput={chatInput}
          setChatInput={setChatInput}
          handleSendMessage={handleSendMessage}
        />
      </div>
      {/*Crew Roaster */}
      <div className="flex flex-1 h-full overflow-hidden px-4 gap-6">
        <div className="flex-1 rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <div className="flex justify-between">
            <h3 className="mb-4 text-slate-400 font-semibold flex items-center gap-2">
              <User size={18} /> Crew Roaster{' '}
              {phase === 'Discussion'
                ? '(Wait till discussion ends to start voting)'
                : '(You can vote now)'}
            </h3>
            <button
              onClick={() => setSelectedVote('skip')}
              className="bg-blue-500/70 flex flex-row justify-center items-center gap-0.5 shadow-2xl border-2 border-black rounded-xl  w-20 h-10 text-slate-300  hover:bg-blue-600/40 transition-colors active:scale-95"
            >
              SKIP <SkipForward size={15} />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 overflow-y-auto p-2 pb-16">
            {players?.map((p: PlayerData) => {
              const isSelected = selectedVote === p.id;
              const canVote = phase === 'Voting' && !p.isDead;

              return (
                <button
                  key={p.id}
                  disabled={!canVote}
                  onClick={() => setSelectedVote(p.id)}
                  className={`relative flex items-center gap-3 rounded-lg border p-3 transition-all ${p.isDead ? 'border-red-900/50 bg-red-950/20 opacity-50 cursor-not-allowed' : 'border-slate-700 bg-slate-800'} ${isSelected ? 'ring-2 ring-emerald-500 border-emerald-500 bg-emerald-900/20' : ''} ${canVote && !isSelected ? 'hover:border-slate-500 hover:bg-slate-700' : ''}`}
                >
                  <CrewMateIcon color={p.color} size={52} isDead={p.isDead} />
                  <div className="flex flex-col text-left">
                    <span
                      className={`font-bold ${p.isDead ? 'text-red-500 line-through' : 'text-slate-200'}`}
                    >
                      {p.id.toUpperCase()} {p.isMe && '(YOU)'}
                    </span>
                  </div>
                  <AnimatePresence>
                    {selectedVote === p.id && (
                      <motion.div
                        initial={{ scale: 0.5, opacity: 0, x: 20 }}
                        animate={{ scale: 0.8, opacity: 1, x: 0 }}
                        exit={{ scale: 0.8, opacity: 0, x: 10 }}
                        transition={{
                          type: 'spring',
                          stiffness: 300,
                          damping: 20,
                        }}
                        className="VOTINGBUTTONS absolute right-2 flex h-3/4 w-28 items-center justify-around"
                      >
                        <button
                          onClick={() => setConfirmedVote(p.id)}
                          className="CONFIRM flex justify-center items-center h-12 w-12 rounded-sm bg-emerald-500 hover:bg-emerald-600 transition-colors active:scale-95"
                        >
                          <Check
                            size={40}
                            className="text-slate-200 opacity-90"
                          />
                        </button>
                        <button
                          onClick={() => setConfirmedVote('skip')}
                          className="CONFIRM flex justify-center items-center h-12 w-12 rounded-sm  bg-rose-500 hover:bg-rose-600 transition-colors active:scale-95"
                        >
                          <X size={40} className="text-slate-200" />
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
