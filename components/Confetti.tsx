import React, { useEffect, useState } from 'react';

interface ConfettiProps {
    show: boolean;
    onComplete?: () => void;
}

const Confetti: React.FC<ConfettiProps> = ({ show, onComplete }) => {
    const [pieces, setPieces] = useState<{ id: number; left: number; color: string; delay: number; size: number }[]>([]);

    useEffect(() => {
        if (show) {
            // Generate confetti pieces
            const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
            const newPieces = Array.from({ length: 50 }, (_, i) => ({
                id: i,
                left: Math.random() * 100,
                color: colors[Math.floor(Math.random() * colors.length)],
                delay: Math.random() * 0.5,
                size: 8 + Math.random() * 8,
            }));
            setPieces(newPieces);

            // Clear after animation
            const timer = setTimeout(() => {
                setPieces([]);
                onComplete?.();
            }, 3000);

            return () => clearTimeout(timer);
        }
    }, [show, onComplete]);

    if (!show || pieces.length === 0) return null;

    return (
        <div className="confetti-container">
            {pieces.map((piece) => (
                <div
                    key={piece.id}
                    className="confetti-piece"
                    style={{
                        left: `${piece.left}%`,
                        top: '100%',
                        backgroundColor: piece.color,
                        width: `${piece.size}px`,
                        height: `${piece.size}px`,
                        animationDelay: `${piece.delay}s`,
                        borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                    }}
                />
            ))}
        </div>
    );
};

export default Confetti;
