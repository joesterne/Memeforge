import React, { memo } from "react";
import { Link } from "react-router";
import { Heart, ArrowUp, ArrowDown } from "lucide-react";

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
  votes?: { upvoters: string[]; downvoters: string[] };
  onVote?: (templateId: string, type: 'up' | 'down' | 'clear') => void;
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
    votes,
    onVote,
    onFavorite,
    onMarkRecent,
  }: TemplateCardProps) => {
    const [imgSrc, setImgSrc] = React.useState(template.url);

    React.useEffect(() => {
      setImgSrc(template.url);
    }, [template.url]);

    const upvotes = votes?.upvoters?.length || 0;
    const downvotes = votes?.downvoters?.length || 0;
    const score = upvotes - downvotes;

    const hasUpvoted = user && votes?.upvoters?.includes(user.uid);
    const hasDownvoted = user && votes?.downvoters?.includes(user.uid);

    return (
      <div className="group relative rounded-3xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 bg-zinc-900 border border-white/10 flex flex-col hover:border-indigo-500/50" style={{ contentVisibility: "auto", containIntrinsicSize: "200px" }}>
        <Link
          to={`/editor/template_${template.id}`}
          state={{ template }}
          onClick={() => onMarkRecent(template.id)}
          className="block aspect-square w-full overflow-hidden bg-zinc-950 relative flex items-center justify-center"
        >
          <img
            src={imgSrc}
            loading="lazy"
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
            decoding="async"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
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

        <div className="p-4 bg-zinc-900 flex-grow flex flex-col justify-center border-t border-white/5 relative">
          <Link
            to={`/editor/template_${template.id}`}
            state={{ template }}
            onClick={() => onMarkRecent(template.id)}
            className="flex-grow flex items-center justify-center pr-16"
          >
            <p className="text-[10px] font-bold text-zinc-300 line-clamp-1 uppercase tracking-widest text-center">
              {template.name}
            </p>
          </Link>

          {/* Voting UI */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 bg-zinc-950/50 rounded-full px-2 py-1 border border-white/5">
            <button
              onClick={(e) => {
                e.preventDefault();
                onVote?.(template.id, hasUpvoted ? 'clear' : 'up');
              }}
              className={`hover:text-indigo-400 transition-colors ${hasUpvoted ? 'text-indigo-500' : 'text-zinc-500'}`}
            >
              <ArrowUp className="w-3.5 h-3.5" strokeWidth={hasUpvoted ? 3 : 2} />
            </button>
            <span className={`text-[10px] font-bold min-w-[1ch] text-center ${score > 0 ? 'text-indigo-400' : score < 0 ? 'text-rose-400' : 'text-zinc-400'}`}>
              {score}
            </span>
            <button
              onClick={(e) => {
                e.preventDefault();
                onVote?.(template.id, hasDownvoted ? 'clear' : 'down');
              }}
              className={`hover:text-rose-400 transition-colors ${hasDownvoted ? 'text-rose-500' : 'text-zinc-500'}`}
            >
              <ArrowDown className="w-3.5 h-3.5" strokeWidth={hasDownvoted ? 3 : 2} />
            </button>
          </div>
        </div>
      </div>
    );
  },
);

TemplateCard.displayName = "TemplateCard";
export default TemplateCard;
