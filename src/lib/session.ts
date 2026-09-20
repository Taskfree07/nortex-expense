/**
 * Who is using the app.
 *
 * This is a demo sign-in: you pick a person from the employee master and the
 * choice is kept in a cookie. It is deliberately NOT authentication - the note
 * says so plainly. Everything downstream (what you can see, what you can decide)
 * is driven by this person's row in the employee master, so swapping the cookie
 * for real SSO later is a change in one file.
 */

import { cookies } from "next/headers";
import { db } from "./db";

export const ACTOR_COOKIE = "nortex_actor";

export type Actor = {
  empCode: string;
  name: string;
  email: string;
  role: string;
  designation: string;
  department: string;
  costCentre: string;
  city: string;
  managerCode: string | null;
  isFinance: boolean;
  isApprover: boolean;
  isAdmin: boolean;
};

export async function getActor(): Promise<Actor | null> {
  const store = await cookies();
  const empCode = store.get(ACTOR_COOKIE)?.value;
  if (!empCode) return null;

  const person = await db.employee.findUnique({ where: { empCode } });
  if (!person) return null;

  return {
    empCode: person.empCode,
    name: person.name,
    email: person.email,
    role: person.role,
    designation: person.designation,
    department: person.department,
    costCentre: person.costCentre,
    city: person.city,
    managerCode: person.managerCode,
    isFinance: person.role === "Finance",
    isApprover: ["Reporting Manager", "Head of Department", "Head of Division", "MD"].includes(person.role),
    // In a real deployment this is a group membership. Here, Finance doubles as Admin.
    isAdmin: person.role === "Finance" || person.role === "MD",
  };
}

export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new Error("Not signed in");
  return actor;
}
