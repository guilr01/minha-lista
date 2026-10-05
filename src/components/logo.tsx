// A marca do protótipo: o lápis no quadrado amarelo, e o nome.
export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex size-[34px] flex-none items-center justify-center rounded-campo bg-amarelo text-tinta">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </span>
      <span className="titulo text-[19px] font-bold">Lista Pronta</span>
    </span>
  );
}
