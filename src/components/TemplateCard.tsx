import React, { memo, useRef } from "react";
import { Link } from "react-router";
import { Heart } from "lucide-react";
import { useIntersectionObserver } from "../lib/hooks";

interface MemeTemplate {
  id: string;
  name: string;
  url: string;
  previewUrl?: string;
  width: number;
  height: number;
  box_count: number;
  dateAdded?: string;
}

interface TemplateCardProps {
  template: MemeTemplate;
  isFavorited: boolean;
  user: any;
  onFavorite: (
    e: React.MouseEvent,
    template: MemeTemplate,
    isFavorited: boolean,
  ) => void;
  onMarkRecent: (id: string) => void;
}

const TemplateCard = memo(
  ({
    template,
    isFavorited,
    user,
    onFavorite,
    onMarkRecent,
  }: TemplateCardProps) => {
    const [imgSrc, setImgSrc] = React.useState(template.url);
    const ref = useRef<HTMLAnchorElement>(null);
    const options = React.useMemo(() => {
      return {
        root: document.getElementById("main-scroll-container"),
        rootMargin: "300px"
      };
    }, []);
    const isVisible = useIntersectionObserver(
      ref,
      options,
      true,
    );

    React.useEffect(() => {
      setImgSrc(template.url);
    }, [template.url]);

    return (
      <div className="group relative rounded-3xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 bg-zinc-900 border border-white/10 flex flex-col hover:border-indigo-500/50">
        <Link
          ref={ref}
          to={`/editor/template_${template.id}`}
          state={{ template }}
          onClick={() => onMarkRecent(template.id)}
          className="block aspect-square w-full overflow-hidden bg-zinc-950 relative flex items-center justify-center"
        >
          {isVisible ? (
            <img
              src={imgSrc}
              onError={(e) => {
                if (template.previewUrl && imgSrc !== template.previewUrl) {
                  setImgSrc(template.previewUrl);
                } else {
                  setImgSrc(
                    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
                  );
                }
              }}
              alt={template.name}
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full absolute inset-0 bg-zinc-900 animate-pulse border-none"></div>
          )}
        </Link>

        {user && (
          <button
            onClick={(e) => onFavorite(e, template, isFavorited)}
            className={`absolute top-3 right-3 p-2 rounded-full shadow-lg backdrop-blur-md transition-all z-10 ${
              isFavorited
                ? "bg-rose-500/90 text-white scale-110"
                : "bg-white/10 text-white/70 hover:bg-rose-500/90 hover:text-white opacity-0 group-hover:opacity-100"
            }`}
            title={isFavorited ? "Remove from favorites" : "Add to favorites"}
          >
            <Heart className={`w-4 h-4 ${isFavorited ? "fill-current" : ""}`} />
          </button>
        )}

        <Link
          to={`/editor/template_${template.id}`}
          state={{ template }}
          onClick={() => onMarkRecent(template.id)}
          className="p-4 bg-zinc-900 flex-grow flex items-center justify-center border-t border-white/5"
        >
          <p className="text-[10px] font-bold text-zinc-300 line-clamp-1 uppercase tracking-widest text-center">
            {template.name}
          </p>
        </Link>
      </div>
    );
  },
);

TemplateCard.displayName = "TemplateCard";
export default TemplateCard;
