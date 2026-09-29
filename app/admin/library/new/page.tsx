import type { Metadata } from "next";
import AdminAddBooksView from "./AdminAddBooksView";
import { getCategories } from "@/lib/categories/config";

export const metadata: Metadata = {
  title: "Add books",
  robots: { index: false, follow: false },
};

export default async function AdminAddBooksPage() {
  return <AdminAddBooksView categories={await getCategories()} />;
}
