import { unstable_rethrow } from "next/navigation";
import { getSignedInUser } from "./session.ts";

/** The signed-in user for the header, or null; also null if the database is down, so legal pages still render. */
export async function headerUser() {
  try {
    return await getSignedInUser();
  } catch (error) {
    // Next signals dynamic rendering and redirects by throwing; those must pass.
    unstable_rethrow(error);
    console.error("Could not load the user for the header", error);
    return null;
  }
}
