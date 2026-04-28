import { createContext, useContext, type ReactNode } from 'react';

/**
 * Контекст для передачи ссылки на основной скролл-контейнер приложения.
 * Используется IntersectionObserver'ом в useInfiniteScroll, чтобы наблюдать
 * пересечение относительно правильного контейнера (а не вьюпорта).
 */
const ScrollContainerContext = createContext<Element | null>(null);

interface ScrollContainerProviderProps {
  element: Element | null;
  children: ReactNode;
}

export function ScrollContainerProvider({ element, children }: ScrollContainerProviderProps) {
  return (
    <ScrollContainerContext.Provider value={element}>
      {children}
    </ScrollContainerContext.Provider>
  );
}

export function useScrollContainer(): Element | null {
  return useContext(ScrollContainerContext);
}
