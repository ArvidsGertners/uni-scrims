import { MAP_POOL } from "@uni-scrims/core/config/maps";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-4">
      <h1 className="text-3xl font-bold">Uni Scrims</h1>
      <p>Die Scrim-Plattform für Valorant-Teams deutscher Hochschulen ist im Aufbau.</p>
      <p className="text-sm opacity-70">Map-Pool: {MAP_POOL.length} Maps</p>
    </main>
  );
}
