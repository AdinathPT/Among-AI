import AnimalTask from './tasks/AnimalTask';
import SPSTask from './tasks/SPSTask';
import XOTask from './tasks/XOTask';
import { type JSX } from 'react';
import UploadTask from './tasks/UploadTask';
import SimonSaysTask from './tasks/SimonSaysTask';
interface TYPEStasksManager {
  isTaskOpen: boolean;
  types: string;
  onClose: () => void;
}

export default function TaskManager({
  isTaskOpen,
  types,
  onClose,
}: TYPEStasksManager) {
  const TaskComp: Record<string, JSX.Element> = {
    cardTask: <AnimalTask onClose={onClose} />,
    eleTask: <XOTask onClose={onClose} />,
    reactorTask: <SPSTask onClose={onClose} />,
    NavTask: <SimonSaysTask onClose={onClose} />,
    chairTask: <UploadTask onClose={onClose} />,
  };
  if (!isTaskOpen) return null;
  return (
    <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center backdrop-blur-sm py-20 ">
      <div onClick={onClose} className="absolute inset-0 z-0" />
      {TaskComp[types] || (
        <div className="text-white text-2xl font-bold">
          Task "{types}" not found!
        </div>
      )}
    </div>
  );
}
