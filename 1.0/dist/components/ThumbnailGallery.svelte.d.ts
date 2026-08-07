type ManifestCanvas = {
    id?: string;
    ['@id']?: string;
} | any;
type $$ComponentProps = {
    canvases?: ManifestCanvas[];
};
declare const ThumbnailGallery: import("svelte").Component<$$ComponentProps, {}, "">;
type ThumbnailGallery = ReturnType<typeof ThumbnailGallery>;
export default ThumbnailGallery;
