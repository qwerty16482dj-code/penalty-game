'use client' // Важно! Это делает компонент клиентским (работает в браузере)

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

export default function PenaltyGame() {
  // Состояние игры
  const [goals, setGoals] = useState(0)
  const [misses, setMisses] = useState(0)
  const [shots, setShots] = useState(0)
  const [message, setMessage] = useState({ text: '', color: '' })
  const [gameOver, setGameOver] = useState(false)
  const [leaderboard, setLeaderboard] = useState([])
  const [playerName, setPlayerName] = useState('')
  
  const maxShots = 5
  const canShoot = useRef(true) // Используем ref, чтобы не вызывать ре-рендер

  // Ссылки на DOM элементы для вычисления позиций
  const ballRef = useRef(null)
  const keeperRef = useRef(null)
  const targetRef = useRef(null)
  const goalRef = useRef(null)

  // Обработка клавиш
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && canShoot.current && shots < maxShots) {
        shoot()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    
    // Загрузка имени из памяти
    const savedName = localStorage.getItem('penaltyName')
    if (savedName) setPlayerName(savedName)
    else setPlayerName(`Игрок_${Math.floor(Math.random() * 1000)}`)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [shots, gameOver]) // Зависимости

  const shoot = () => {
    canShoot.current = false
    
    const ball = ballRef.current
    const target = targetRef.current.getBoundingClientRect()
    const goal = goalRef.current.getBoundingClientRect()

    // Вычисляем координаты полета
    // Смещение target относительно goal + начальная позиция goal
    const relativeX = (target.left - goal.left) + goalRef.current.offsetLeft + (target.width / 2) - 20
    const relativeY = (target.top - goal.top) + goalRef.current.offsetTop + (target.height / 2) - 20

    // Применяем стили напрямую к DOM элементу (для производительности анимации)
    // -300 и -350 — это ручная калибровка под размер контейнера
    ball.style.transform = `translate(${relativeX - 300}px, ${relativeY - 350}px) scale(0.6)`

    setTimeout(checkResult, 500)
  }

  const checkResult = () => {
    const keeper = keeperRef.current.getBoundingClientRect()
    const target = targetRef.current.getBoundingClientRect()

    // Логика коллизии (пересечения)
    const isSave = !(
      target.right < keeper.left || 
      target.left > keeper.right || 
      target.bottom < keeper.top || 
      target.top > keeper.bottom
    )

    if (isSave) {
      setMisses(prev => prev + 1)
      showMessage("СЭЙВ!", "red")
    } else {
      setGoals(prev => prev + 1)
      showMessage("ГОЛ!", "#2ecc71")
    }

    setShots(prev => prev + 1)

    // Возврат мяча или конец игры
    setTimeout(() => {
      if (shots + 1 < maxShots) {
        resetBall()
      } else {
        finishGame()
      }
    }, 1500)
  }

  const showMessage = (text, color) => {
    setMessage({ text, color, opacity: 1 })
    setTimeout(() => setMessage(prev => ({ ...prev, opacity: 0 })), 1000)
  }

  const resetBall = () => {
    if (ballRef.current) {
      ballRef.current.style.transform = 'translateX(-50%)'
    }
    canShoot.current = true
  }

  const finishGame = () => {
    setGameOver(true)
    fetchLeaderboard()
  }

  // --- SUPABASE ЛОГИКА ---

  const saveScore = async () => {
    localStorage.setItem('penaltyName', playerName)
    
    const { error } = await supabase
      .from('leaderboard')
      .insert({ player_name: playerName, score: goals }) // Используем goals из стейта, так как он актуален (но нужен fix)
      
    // React state update is async, so inside checkResult goals isn't updated instantly for insertion if we called save there.
    // But here in menu it is stable. 
    // НО! goals в checkResult обновляется асинхронно. 
    // Для надежности при сохранении добавим +1 к goals, если последний был гол? 
    // Нет, React уже обновил стейт к моменту появления меню. Используем текущий goals.
    
    // Фикс логики сохранения: т.к. мы в меню, goals уже финальный. Но нам нужно добавить гол последнего удара.
    // В React useState values внутри замыканий могут быть старыми. 
    // В данном случае menu рендерится после обновления стейта, так что goals корректен.

    // Но есть нюанс: checkResult обновляет стейт, а потом вызывает finishGame.
    // При вызове finishGame внутри checkResult значение goals в замыкании старое.
    // Лучше передать итоговый счет в finishGame аргументом или использовать useEffect на gameOver.

    if (!error) {
      alert('Сохранено!')
      fetchLeaderboard()
    } else {
      console.error(error)
    }
  }

  const fetchLeaderboard = async () => {
    const { data, error } = await supabase
      .from('leaderboard')
      .select()
      .order('score', { ascending: false })
      .limit(5)
      
    if (!error) setLeaderboard(data)
  }

  const restartGame = () => {
    setGoals(0)
    setMisses(0)
    setShots(0)
    setGameOver(false)
    resetBall()
  }

  return (
    <main>
      <h2>⚽ Penalty King</h2>

      <div className="game-container">
        <div className="goal" ref={goalRef}>
          <div className="goalkeeper" ref={keeperRef}>🧤</div>
          <div className="target" ref={targetRef}></div>
        </div>

        <div 
          className="message" 
          style={{ color: message.color, opacity: message.opacity, transition: 'opacity 0.3s' }}
        >
          {message.text}
        </div>

        <div className="ball" id="ball" ref={ballRef}>⚽️</div>

        {/* Меню конца игры */}
        {gameOver && (
          <div className="end-menu">
            <h3>Матч окончен! Счет: {goals}</h3>
            <input 
              value={playerName} 
              onChange={(e) => setPlayerName(e.target.value)} 
              placeholder="Твое имя" 
            />
            <br/>
            <button onClick={() => saveScoreWithCorrectGoals(goals)}>Сохранить рекорд</button>
            <button onClick={restartGame} style={{marginLeft: '10px', background: '#7f8c8d'}}>Сыграть еще</button>
            
            <h4>🏆 Топ игроков:</h4>
            <ul>
              {leaderboard.map((p, i) => (
                <li key={i}>{i+1}. {p.player_name} — <b>{p.score}</b></li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="hud">
        <span>Забито: {goals} | Промахов: {misses}</span> <br />
        <span>{shots < maxShots ? `Удар: ${shots + 1} / ${maxShots}` : "Матч окончен"}</span>
      </div>

      <div className="controls">
        Нажми <b>ПРОБЕЛ</b> для удара!
      </div>
    </main>
  )
  
  // Хелпер для сохранения, чтобы обойти замыкания, если нужно (но тут мы берем из стейта input)
  async function saveScoreWithCorrectGoals(currentGoals) {
     localStorage.setItem('penaltyName', playerName)
     const { error } = await supabase
      .from('leaderboard')
      .insert({ player_name: playerName, score: currentGoals })
     
     if(!error) {
       alert("Сохранено!"); 
       fetchLeaderboard();
     }
  }
}