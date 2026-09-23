export default function BookNotFound() {
  return (
    <div className="w-full h-screen flex flex-col items-center justify-center gap-2 bg-sand-50 text-center px-6">
      <h1 className="text-xl font-semibold font-serif text-sand-950">Book not found</h1>
      <p className="text-sm text-sand-600">
        We couldn&apos;t find a book at this address.
      </p>
    </div>
  );
}
