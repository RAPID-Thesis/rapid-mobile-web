import { ReactNode, createContext, useContext } from 'react';

interface TypographyContextValue {
  interLoaded: boolean;
}

const TypographyContext = createContext<TypographyContextValue>({
  interLoaded: false,
});

export function TypographyProvider({
  value,
  children,
}: {
  value: TypographyContextValue;
  children: ReactNode;
}) {
  return <TypographyContext.Provider value={value}>{children}</TypographyContext.Provider>;
}

export function useTypography() {
  return useContext(TypographyContext);
}
