import { getCanvasId } from '../utils/iiifIds';
export type ChoiceGroup = {
    canvasId: string;
    choices: any[];
    selectedChoiceId: string | undefined;
    side: 'left' | 'right';
};
export type VisibleCanvasEntry = {
    canvasId: string;
    canvas: any;
};
export type PagedCanvasGroup = {
    startIndex: number;
    endIndex: number;
    entries: VisibleCanvasEntry[];
};
export type CanvasNavDirection = 'previous' | 'next';
export type CanvasNavIcon = 'left' | 'right' | 'up' | 'down';
export type CanvasNavLayout = {
    leftButton: CanvasNavDirection;
    rightButton: CanvasNavDirection;
    leftIcon: CanvasNavIcon;
    rightIcon: CanvasNavIcon;
};
export declare function shouldUseAbbreviatedChoiceLabels(viewingMode: ViewingMode, visibleChoiceGroups: ChoiceGroup[]): boolean;
export declare function getCanvasNavLayout(viewingDirection: ViewingDirection): CanvasNavLayout;
type ViewingMode = 'individuals' | 'paged' | 'continuous';
type ViewingDirection = 'left-to-right' | 'right-to-left' | 'top-to-bottom' | 'bottom-to-top';
type VisibleChoiceGroupArgs = {
    canvases: any[];
    currentCanvasId: string | null;
    currentCanvasIndex: number;
    viewingMode: ViewingMode;
    pagedOffset: number;
    viewingDirection: ViewingDirection;
    getSelectedChoice: (canvasId: string) => string | undefined;
};
export { getCanvasId };
export declare function getPagedCanvasGroups(canvases: any[], pagedOffset: number): PagedCanvasGroup[];
export declare function getVisibleCanvasEntries({ canvases, currentCanvasId, currentCanvasIndex, viewingMode, pagedOffset, }: Omit<VisibleChoiceGroupArgs, 'viewingDirection' | 'getSelectedChoice'>): VisibleCanvasEntry[];
export declare function getVisibleChoiceGroups({ canvases, currentCanvasId, currentCanvasIndex, viewingMode, pagedOffset, viewingDirection, getSelectedChoice, }: VisibleChoiceGroupArgs): ChoiceGroup[];
