export default function OrbitBackdrop() {
  return (
    <div className="orbit-backdrop" aria-hidden="true">
      <div className="star star-a" />
      <div className="star star-b" />
      <div className="star star-c" />
      <div className="planet planet-main" />
      <div className="planet-ring" />
      <div className="moon moon-a" />
      <div className="moon moon-b" />
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
    </div>
  );
}
