export const useSearchParams = () => [new URLSearchParams(window.location.search), jest.fn()] as const;
