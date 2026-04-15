import Phaser from 'phaser';
import { useEffect, useState } from 'react';
import { configCafe } from './game/BasicScene';
import MeetingModal, { type PlayerData } from './components/MeetingModal';
import TaskManager from './components/TasksManager';
import GameOverModal from './components/GameOverModal';
declare global {
  interface Window {
    game: Phaser.Game;
    triggerMeeting: (data: PlayerData[]) => void;
    triggerTask: (taskID: string) => void;
    toggleKeyboard: (isEnabled: boolean) => void;
    resumePhaserGame: () => void;
    completedPlayerTasks: (taskID: string) => void;
    triggerGameOver: (winner: 'crewmate' | 'impostor') => void;
    processEjection: (ejectedId: string | null) => void;
    requestSusVote: (dummyName: string, aliveIDS: string[]) => string;
  }
}

function App() {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isTaskOpen, setIsTaskOpen] = useState<boolean>(false);
  const [meetingData, setMeetingData] = useState<PlayerData[]>([]);
  const [taskID, setTaskID] = useState<string>('animal');
  const [winner, setWinner] = useState<'crewmate' | 'impostor' | null>(null);
  // const testAI = async () => {
  //   const history = [
  //     'Gemini: I saw gpt near the body',
  //     'claude: It is definetly sus.',
  //   ];
  //   console.log('[Asking the AI...]');
  //   const response = await getBotResponse('Ollama', 'imposter', history);
  //   console.log('AI (olmma) says:', response);
  // };
  // useEffect(() => {
  //   testAI();
  // }, []);
  // return null;
  useEffect(() => {
    const game = new Phaser.Game(configCafe);
    window.game = game;
    window.triggerMeeting = (data: PlayerData[]) => {
      setMeetingData(data);
      setIsOpen(true);
    };
    window.triggerTask = (taskID: string) => {
      setTaskID(taskID);
      setIsTaskOpen(true);
    };
    window.triggerGameOver = (winningTeam) => {
      setWinner(winningTeam);
    };

    return () => {
      game.destroy(true);
    };
  }, []);

  const handleCloseMeeting = () => {
    setIsOpen(false);
  };
  const handleCloseTask = () => {
    setIsTaskOpen(false);
    const phaserGame = window.game;

    if (phaserGame) {
      const scene = phaserGame.scene.getScene('BasicScene');

      if (scene) {
        scene.scene.resume();
        scene.physics.resume();
      }
    }
  };
  return (
    <div className="relative h-screen w-screen bg-black">
      <div id="_GAME-CONTAINER" className="h-full w-full" />
      <MeetingModal
        key={isOpen ? 'meeting-active' : 'meeting-closed'}
        isOpen={isOpen}
        initialPlayers={meetingData}
        onClose={handleCloseMeeting}
      />
      <TaskManager
        key={isTaskOpen ? 'task-active' : 'task-closed'}
        isTaskOpen={isTaskOpen}
        taskID={taskID}
        onClose={handleCloseTask}
      />
      <GameOverModal winner={winner} />
    </div>
  );
}

export default App;
