import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
    secret: process.env.AUTH_SECRET,
    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
    ],
    pages: {
        signIn: "/",
    },
    callbacks: {
        async session({ session, token }) {
            // Attach user ID from the JWT token to the session
            if (token.sub) {
                session.user.id = token.sub;
            }
            return session;
        },
    },
});
