import { getSession } from "@/lib/auth";
import Landing from "@/app/components/Landing";

export const dynamic = "force-dynamic";

// Set the theme before paint. The homepage defaults to light; it only goes
// dark if the visitor previously chose dark (shared pdt_theme key).
const themeScript = `(function(){try{var t=localStorage.getItem('pdt_theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default async function Home() {
  const user = await getSession();
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      <Landing signedIn={!!user} />
    </>
  );
}
