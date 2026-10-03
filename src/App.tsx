import { useStore } from './store';
import { CreateScreen } from './ui/CreateScreen';
import { GameScreen } from './ui/GameScreen';
import { ModEditor } from './ui/ModEditor';
import { TitleScreen } from './ui/TitleScreen';

export function App() {
  const screen = useStore((s) => s.screen);
  return (
    <div className="app">
      {screen === 'title' && <TitleScreen />}
      {screen === 'create' && <CreateScreen />}
      {screen === 'game' && <GameScreen />}
      {screen === 'editor' && <ModEditor />}
    </div>
  );
}
