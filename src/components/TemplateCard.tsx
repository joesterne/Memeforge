import React, { memo } from "react";
import { Link } from "react-router";
import { Heart } from "lucide-react";

interface MemeTemplate {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  box_count: number;
  dateAdded?: string;
}

interface TemplateCardProps {
  template: MemeTemplate;
  isFavorited: boolean;
  user: any;
  onFavorite: (e: React.MouseEvent, template: MemeTemplate, isFavorited: boolean) => void;
  onMarkRecent: (id: string) => void;
}

const TemplateCard = memo(({ template, isFavorited, user, onFavorite, onMarkRecent }: TemplateCardProps) => {
  return (
    <div className="group relative rounded-3xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 bg-zinc-900 border border-white/10 flex flex-col hover:border-indigo-500/50">
      <Link 
        to={`/editor/template_${template.id}`}
        state={{ template }}
        onClick={() => onMarkRecent(template.id)}
        className="block aspect-square w-full overflow-hidden bg-zinc-950"
      >
        <img 
          src={template.url} 
          alt={template.name}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
      </Link>
      
      {user && (
          <button 
              onClick={(e) => onFavorite(e, template, isFavorited)}
              className={`absolute top-3 right-3 p-2 rounded-full shadow-lg backdrop-blur-md transition-all z-10 ${
                  isFavorited 
                  ? 'bg-rose-500/90 text-white scale-110' 
                  : 'bg-white/10 text-white/70 hover:bg-rose-500/90 hover:text-white opacity-0 group-hover:opacity-100'
              }`}
              title={isFavorited ? "Remove from favorites" : "Add to favorites"}
          >
              <Heart className={`w-4 h-4 ${isFavorited ? 'fill-current' : ''}`} />
          </button>
      )}
      
      <Link 
        to={`/editor/template_${template.id}`}
        state={{ template }}
        onClick={() => onMarkRecent(template.id)} 
        className="p-4 bg-zinc-900 flex-grow flex items-center justify-center border-t border-white/5"
      >
         <p className="text-[10px] font-bold text-zinc-300 line-clamp-1 uppercase tracking-widest text-center">{template.name}</p>
      </Link>
    </div>
  );
});

TemplateCard.displayName = "TemplateCard";
export default TemplateCard;
