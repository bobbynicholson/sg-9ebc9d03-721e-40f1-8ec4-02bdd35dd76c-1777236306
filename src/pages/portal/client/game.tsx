import Head from "next/head";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ClientNav } from "@/components/client/ClientNav";
import { CateringDashGame } from "@/components/games/CateringDashGame";

function ClientGamePage() {
  return (
    <>
      <Head>
        <title>Catering Dash Game - Client Portal</title>
      </Head>
      <ClientNav />
      <div className="lg:pl-64 xl:pl-72">
        <CateringDashGame onClose={() => {}} />
      </div>
    </>
  );
}

export default function ProtectedClientGamePage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.CLIENT]}>
      <ClientGamePage />
    </ProtectedRoute>
  );
}
