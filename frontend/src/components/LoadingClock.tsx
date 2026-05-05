import { useEffect, useState } from 'react';

export default function LoadingClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const hours = time.getHours() % 12;
  const minutes = time.getMinutes();
  const seconds = time.getSeconds();

  const hourAngle = hours * 30 + minutes * 0.5;
  const minuteAngle = minutes * 6;
  const secondAngle = seconds * 6;

  return (
    <div className="flex flex-col items-center justify-center gap-8">
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full blur-lg opacity-40" />

        <div className="relative bg-white/10 backdrop-blur-md rounded-full p-6 shadow-xl border border-white/20">
          <svg className="w-32 h-32" viewBox="0 0 200 200">
            <circle
              cx="100"
              cy="100"
              r="95"
              fill="none"
              stroke="rgba(255, 255, 255, 0.1)"
              strokeWidth="2"
            />

            {Array.from({ length: 12 }).map((_, i) => {
              const angle = (i * 30 * Math.PI) / 180;
              const x1 = 100 + 80 * Math.sin(angle);
              const y1 = 100 - 80 * Math.cos(angle);
              const x2 = 100 + 90 * Math.sin(angle);
              const y2 = 100 - 90 * Math.cos(angle);
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="rgba(255, 255, 255, 0.3)"
                  strokeWidth={i % 3 === 0 ? '3' : '2'}
                  strokeLinecap="round"
                />
              );
            })}

            <line
              x1="100"
              y1="100"
              x2="100"
              y2="55"
              stroke="rgba(255, 255, 255, 0.9)"
              strokeWidth="6"
              strokeLinecap="round"
              style={{
                transformOrigin: '100px 100px',
                transform: `rotate(${hourAngle}deg)`,
                transition: 'transform 0.5s cubic-bezier(0.4, 0.0, 0.2, 1)',
              }}
            />

            <line
              x1="100"
              y1="100"
              x2="100"
              y2="40"
              stroke="rgba(255, 255, 255, 0.9)"
              strokeWidth="4"
              strokeLinecap="round"
              style={{
                transformOrigin: '100px 100px',
                transform: `rotate(${minuteAngle}deg)`,
                transition: 'transform 0.5s cubic-bezier(0.4, 0.0, 0.2, 1)',
              }}
            />

            <line
              x1="100"
              y1="100"
              x2="100"
              y2="35"
              stroke="#3b82f6"
              strokeWidth="2"
              strokeLinecap="round"
              style={{
                transformOrigin: '100px 100px',
                transform: `rotate(${secondAngle}deg)`,
              }}
            />

            <circle cx="100" cy="100" r="6" fill="rgba(255, 255, 255, 0.9)" />
            <circle cx="100" cy="100" r="3" fill="#3b82f6" />
          </svg>
        </div>
      </div>

      <div className="space-y-3 text-center">
        <div className="flex items-center gap-2 justify-center">
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" />
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:0.2s]" />
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:0.4s]" />
        </div>

        <p className="text-sm text-gray-600 font-medium animate-pulse">
          Loading your workspace...
        </p>
      </div>
    </div>
  );
}
