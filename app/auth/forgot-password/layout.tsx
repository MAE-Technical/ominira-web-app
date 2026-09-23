import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Forgot password",
  description: "Get a link to reset your password by email.",
};

export default function ForgotPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}
