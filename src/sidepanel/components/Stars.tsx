interface StarsProps {
  value: number;
  score: number;
}

const STAR_PATH = "M12 2.5l2.9 6.2 6.6.8-4.9 4.6 1.3 6.6L12 17.4 6.1 20.7l1.3-6.6L2.5 9.5l6.6-.8L12 2.5z";

export function Stars({ value, score }: StarsProps) {
  return (
    <div
      className="stars"
      role="img"
      aria-label={`Match score ${value} out of 5, ${score} out of 100`}
    >
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span className="star" key={i}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={STAR_PATH} className="star-empty" />
              <svg viewBox="0 0 24 24" className="star-fill" style={{ width: `${fill * 100}%` }}>
                <path d={STAR_PATH} />
              </svg>
            </svg>
          </span>
        );
      })}
      <span className="stars-value">{value.toFixed(1)}</span>
    </div>
  );
}
