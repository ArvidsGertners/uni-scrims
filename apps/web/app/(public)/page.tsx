import { LandingView } from "./landing-view";

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <LandingView params={await searchParams} />;
}
