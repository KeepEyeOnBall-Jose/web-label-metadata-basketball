import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import BackendViewClient from "./BackendViewClient";

const ROOT_EMAILS = [
    "jose@keepeyeonball.com",
    "david.cotaina@keepeyeonball.com",
    "vectorblanco@gmail.com",
];

export default async function BackendPage() {
    const session = await auth();

    if (!session?.user) {
        redirect("/");
    }

    if (!session.user.email || !ROOT_EMAILS.includes(session.user.email)) {
        return (
            <main className="landing">
                <div className="landing-header">
                    <h1>🔒 Access Denied</h1>
                    <p>You do not have permission to view this page.</p>
                    <p style={{ marginTop: 16, fontSize: "0.85rem", color: "var(--text-muted)" }}>
                        Signed in as: {session.user.email}
                    </p>
                </div>
            </main>
        );
    }

    return <BackendViewClient userEmail={session.user.email} />;
}
