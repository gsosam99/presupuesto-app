import { redirect } from "next/navigation";

export default function Home() {
  // La home todavía no tiene contenido propio: el dashboard llega con el Flujo D.
  redirect("/cargas");
}
