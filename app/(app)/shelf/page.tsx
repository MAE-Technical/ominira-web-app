import type { Metadata } from "next";
import ShelfView from "@/app/components/books/ShelfView";

export const metadata: Metadata = {
  title: "Shelf",
  description: "The books you're reading, the ones you've saved, and the ones you've finished on Ominira.",
};

export default function ShelfPage() {
  return <ShelfView />;
}
