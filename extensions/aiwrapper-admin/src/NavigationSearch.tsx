import { useEffect, useRef } from "react";
import { IconSearch, IconX } from "../../../apps/opencodex-gui/src/icons";
import { useHeaderSearchStore } from "./header-search-store";

export default function NavigationSearch({
  placeholder,
  clearLabel,
  onShortcut,
}: {
  placeholder: string;
  clearLabel: string;
  onShortcut?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const visible = useHeaderSearchStore(state => state.visible);
  const query = useHeaderSearchStore(state => state.query);
  const registeredPlaceholder = useHeaderSearchStore(state => state.placeholder);
  const setQuery = useHeaderSearchStore(state => state.setQuery);
  const register = useHeaderSearchStore(state => state.register);
  const unregister = useHeaderSearchStore(state => state.unregister);

  useEffect(() => {
    register(placeholder);
    return unregister;
  }, [placeholder, register, unregister]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        onShortcut?.();
        requestAnimationFrame(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        });
      }
      if (event.key === "Escape" && document.activeElement === inputRef.current) {
        setQuery("");
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, [onShortcut, setQuery]);

  if (!visible) return null;

  return (
    <div className="aiw-navigation-search">
      <IconSearch aria-hidden />
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder={registeredPlaceholder}
        aria-label={registeredPlaceholder}
        aria-keyshortcuts="Control+K Meta+K"
      />
      {query ? (
        <button type="button" onClick={() => setQuery("")} aria-label={clearLabel}>
          <IconX aria-hidden />
        </button>
      ) : <kbd>Ctrl K</kbd>}
    </div>
  );
}
