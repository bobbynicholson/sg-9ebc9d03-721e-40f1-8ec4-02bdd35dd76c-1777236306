
import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trophy, Play, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { gamificationService } from "@/services/gamificationService";

interface GameObject {
  id: string;
  x: number;
  y: number;
  type: 'food' | 'cutlery';
  emoji: string;
  speed: number;
}

interface GameStats {
  score: number;
  foodCaught: number;
  cutleryHit: number;
  maxStreak: number;
  currentStreak: number;
}

const FOOD_ITEMS = ['🍕', '🍰', '🥗', '🍔', '🌮', '🍣', '🥙', '🍜', '🍱', '🥘'];
const CUTLERY_ITEMS = ['🔪', '🍴', '🥄', '🍽️', '🥢'];
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const PLAYER_SIZE = 60;
const OBJECT_SIZE = 50;

export function CateringDashGame({ onClose }: { onClose?: () => void }) {
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number>();
  const objectsRef = useRef<GameObject[]>([]);
  const spawnTimerRef = useRef<number>(0);

  const [gameState, setGameState] = useState<'menu' | 'playing' | 'gameover'>('menu');
  const [playerY, setPlayerY] = useState(CANVAS_HEIGHT / 2);
  const [stats, setStats] = useState<GameStats>({
    score: 0,
    foodCaught: 0,
    cutleryHit: 0,
    maxStreak: 0,
    currentStreak: 0
  });
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [highScore, setHighScore] = useState(0);

  useEffect(() => {
    loadLeaderboard();
    loadHighScore();
  }, []);

  useEffect(() => {
    if (gameState === 'playing') {
      startGame();
    } else {
      stopGame();
    }

    return () => stopGame();
  }, [gameState]);

  const loadLeaderboard = async () => {
    try {
      const leaders = await gamificationService.getLeaderboard(undefined, 10);
      setLeaderboard(leaders);
    } catch (error) {
      console.error('Error loading leaderboard:', error);
    }
  };

  const loadHighScore = async () => {
    if (!user) return;
    try {
      const history = await gamificationService.getUserPointHistory(user.id, 100);
      const gameScores = history.filter(h => h.action_type === 'catering_dash_game');
      const max = Math.max(...gameScores.map(g => g.points), 0);
      setHighScore(max);
    } catch (error) {
      console.error('Error loading high score:', error);
    }
  };

  const startGame = () => {
    objectsRef.current = [];
    spawnTimerRef.current = 0;
    setStats({
      score: 0,
      foodCaught: 0,
      cutleryHit: 0,
      maxStreak: 0,
      currentStreak: 0
    });
    setPlayerY(CANVAS_HEIGHT / 2);
    gameLoop();
  };

  const stopGame = () => {
    if (gameLoopRef.current) {
      cancelAnimationFrame(gameLoopRef.current);
    }
  };

  const spawnObject = () => {
    const isFood = Math.random() > 0.35; // 65% food, 35% cutlery
    const emoji = isFood 
      ? FOOD_ITEMS[Math.floor(Math.random() * FOOD_ITEMS.length)]
      : CUTLERY_ITEMS[Math.floor(Math.random() * CUTLERY_ITEMS.length)];

    const obj: GameObject = {
      id: Math.random().toString(36),
      x: CANVAS_WIDTH,
      y: Math.random() * (CANVAS_HEIGHT - OBJECT_SIZE),
      type: isFood ? 'food' : 'cutlery',
      emoji,
      speed: 3 + Math.random() * 2
    };

    objectsRef.current.push(obj);
  };

  const checkCollision = (obj: GameObject): boolean => {
    const playerX = 50;
    const playerTop = playerY - PLAYER_SIZE / 2;
    const playerBottom = playerY + PLAYER_SIZE / 2;
    const objTop = obj.y;
    const objBottom = obj.y + OBJECT_SIZE;

    return (
      obj.x < playerX + PLAYER_SIZE &&
      obj.x + OBJECT_SIZE > playerX &&
      objBottom > playerTop &&
      objTop < playerBottom
    );
  };

  const gameLoop = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw player (chef)
    ctx.font = `${PLAYER_SIZE}px Arial`;
    ctx.fillText('👨‍🍳', 50, playerY + PLAYER_SIZE / 3);

    // Spawn new objects
    spawnTimerRef.current++;
    if (spawnTimerRef.current > 60) {
      spawnObject();
      spawnTimerRef.current = 0;
    }

    // Update and draw objects
    objectsRef.current = objectsRef.current.filter(obj => {
      obj.x -= obj.speed;

      // Check collision
      if (checkCollision(obj)) {
        if (obj.type === 'food') {
          // Caught food!
          const newStreak = stats.currentStreak + 1;
          setStats(prev => ({
            ...prev,
            score: prev.score + 10 + (newStreak * 2),
            foodCaught: prev.foodCaught + 1,
            currentStreak: newStreak,
            maxStreak: Math.max(prev.maxStreak, newStreak)
          }));
        } else {
          // Hit cutlery!
          setStats(prev => ({
            ...prev,
            cutleryHit: prev.cutleryHit + 1,
            currentStreak: 0
          }));

          if (stats.cutleryHit >= 2) {
            endGame();
          }
        }
        return false;
      }

      // Draw object
      ctx.font = `${OBJECT_SIZE}px Arial`;
      ctx.fillText(obj.emoji, obj.x, obj.y + OBJECT_SIZE);

      return obj.x > -OBJECT_SIZE;
    });

    if (gameState === 'playing') {
      gameLoopRef.current = requestAnimationFrame(gameLoop);
    }
  };

  const endGame = async () => {
    setGameState('gameover');
    
    if (!user) return;

    // Award points based on score
    if (stats.score > 0) {
      try {
        await gamificationService.awardPoints(
          user.id,
          stats.score,
          'catering_dash_game',
          `Scored ${stats.score} points in Catering Dash!`
        );

        // Update high score if beaten
        if (stats.score > highScore) {
          setHighScore(stats.score);
        }

        await loadLeaderboard();
      } catch (error) {
        console.error('Error saving score:', error);
      }
    }
  };

  const handleKeyPress = useCallback((e: KeyboardEvent) => {
    if (gameState !== 'playing') return;

    if (e.key === 'ArrowUp') {
      setPlayerY(y => Math.max(PLAYER_SIZE / 2, y - 30));
    } else if (e.key === 'ArrowDown') {
      setPlayerY(y => Math.min(CANVAS_HEIGHT - PLAYER_SIZE / 2, y + 30));
    }
  }, [gameState]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <span className="text-2xl">👨‍🍳</span>
              Catering Dash
            </CardTitle>
            {onClose && (
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {gameState === 'menu' && (
            <div className="text-center space-y-6">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold">Welcome to Catering Dash!</h2>
                <p className="text-muted-foreground">
                  Catch the food 🍕🍰🥗 and avoid the cutlery 🔪🍴🍽️
                </p>
              </div>

              <div className="bg-muted p-6 rounded-lg space-y-3 text-left max-w-md mx-auto">
                <h3 className="font-semibold">How to Play:</h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <span className="text-green-600">✓</span>
                    <span>Use <strong>Arrow Up/Down</strong> or buttons below to move</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-600">✓</span>
                    <span>Catch food items to score points</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-600">✓</span>
                    <span>Build streaks for bonus points</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-600">✗</span>
                    <span>Avoid cutlery - 3 hits = game over!</span>
                  </li>
                </ul>
              </div>

              {highScore > 0 && (
                <div className="flex items-center justify-center gap-2">
                  <Trophy className="w-5 h-5 text-yellow-600" />
                  <span className="font-semibold">Your High Score: {highScore}</span>
                </div>
              )}

              <Button size="lg" onClick={() => setGameState('playing')} className="gap-2">
                <Play className="w-5 h-5" />
                Start Game
              </Button>
            </div>
          )}

          {gameState === 'playing' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="text-2xl font-bold">Score: {stats.score}</div>
                  <div className="text-sm text-muted-foreground">
                    Streak: {stats.currentStreak}x {stats.currentStreak > 0 && '🔥'}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Badge variant={stats.cutleryHit >= 2 ? "destructive" : "secondary"}>
                    Lives: {3 - stats.cutleryHit}
                  </Badge>
                  <Badge variant="outline">
                    Food: {stats.foodCaught} 🍕
                  </Badge>
                </div>
              </div>

              <div className="border-4 border-slate-200 rounded-lg overflow-hidden bg-gradient-to-br from-blue-50 to-purple-50">
                <canvas
                  ref={canvasRef}
                  width={CANVAS_WIDTH}
                  height={CANVAS_HEIGHT}
                  className="w-full"
                />
              </div>

              <div className="flex gap-4 justify-center">
                <Button
                  size="lg"
                  onMouseDown={() => setPlayerY(y => Math.max(PLAYER_SIZE / 2, y - 30))}
                  className="w-32"
                >
                  ⬆️ Up
                </Button>
                <Button
                  size="lg"
                  onMouseDown={() => setPlayerY(y => Math.min(CANVAS_HEIGHT - PLAYER_SIZE / 2, y + 30))}
                  className="w-32"
                >
                  ⬇️ Down
                </Button>
              </div>

              <div className="text-center text-sm text-muted-foreground">
                Use arrow keys or buttons above to move
              </div>
            </div>
          )}

          {gameState === 'gameover' && (
            <div className="text-center space-y-6">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold">Game Over!</h2>
                <p className="text-muted-foreground">Great job, Chef! 👨‍🍳</p>
              </div>

              <div className="bg-gradient-to-br from-yellow-50 to-orange-50 p-6 rounded-lg space-y-3 max-w-md mx-auto">
                <div className="text-4xl font-bold text-orange-600">{stats.score} Points</div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Food Caught</div>
                    <div className="font-semibold">{stats.foodCaught} 🍕</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Max Streak</div>
                    <div className="font-semibold">{stats.maxStreak}x 🔥</div>
                  </div>
                </div>
              </div>

              {stats.score > highScore && (
                <div className="bg-yellow-100 border-2 border-yellow-400 rounded-lg p-4">
                  <div className="flex items-center justify-center gap-2 text-yellow-900 font-bold">
                    <Trophy className="w-6 h-6" />
                    NEW HIGH SCORE!
                  </div>
                </div>
              )}

              <div className="flex gap-4 justify-center">
                <Button size="lg" onClick={() => setGameState('playing')} className="gap-2">
                  <Play className="w-5 h-5" />
                  Play Again
                </Button>
                <Button size="lg" variant="outline" onClick={() => setGameState('menu')}>
                  Main Menu
                </Button>
              </div>
            </div>
          )}

          {leaderboard.length > 0 && (
            <div className="border-t pt-6">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Trophy className="w-6 h-6 text-yellow-600" />
                Top 10 Leaderboard
              </h3>
              <div className="space-y-2">
                {leaderboard.slice(0, 10).map((entry, index) => (
                  <div
                    key={entry.user_id}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      entry.user_id === user?.id ? 'bg-blue-50 border-2 border-blue-200' : 'bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                        index === 0 ? 'bg-yellow-400 text-yellow-900' :
                        index === 1 ? 'bg-slate-300 text-slate-700' :
                        index === 2 ? 'bg-orange-400 text-orange-900' :
                        'bg-slate-200 text-slate-600'
                      }`}>
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-semibold">{entry.full_name}</div>
                        <div className="text-xs text-muted-foreground capitalize">{entry.role}</div>
                      </div>
                    </div>
                    <div className="font-bold text-lg">{entry.total_points}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
