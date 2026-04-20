
"use client";

export default function ShowcaseLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] w-full animate-fade-in">
      {/* Animated chef hat and wok */}
      <div className="relative mb-6">
        {/* Wok */}
        <div className="w-24 h-10 bg-gradient-to-t from-gray-700 to-gray-400 rounded-b-full shadow-lg animate-wok-bounce flex items-end justify-center">
          {/* Flames */}
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
            <div className="w-2 h-4 bg-yellow-400 rounded-full animate-flame-flicker" />
            <div className="w-2 h-5 bg-orange-500 rounded-full animate-flame-flicker delay-100" />
            <div className="w-2 h-3 bg-red-500 rounded-full animate-flame-flicker delay-200" />
          </div>
        </div>
        {/* Chef hat */}
        <div className="absolute -top-10 left-1/2 -translate-x-1/2">
          <div className="w-14 h-8 bg-white rounded-t-full shadow-md" />
          <div className="w-8 h-4 bg-white rounded-b-full mx-auto -mt-2" />
        </div>
        {/* Cooking utensil */}
        <div className="absolute right-0 top-2 rotate-12">
          <div className="w-8 h-1 bg-yellow-700 rounded-full" />
          <div className="w-2 h-2 bg-yellow-400 rounded-full -mr-1 -mt-1" />
        </div>
      </div>
      <div className="text-xl font-bold text-yellow-300 drop-shadow mb-2 animate-pulse">
        Wok Hei Loading...
      </div>
      <div className="text-base text-white/80 text-center max-w-xs">
        Our chef is firing up the wok and infusing your page with extra flavor.<br />Hang tight, your culinary adventure is almost ready!
      </div>
      <style jsx>{`
        .animate-wok-bounce {
          animation: wok-bounce 1.2s infinite alternate cubic-bezier(.6,-0.28,.74,.05);
        }
        @keyframes wok-bounce {
          0% { transform: translateY(0); }
          100% { transform: translateY(-10px); }
        }
        .animate-flame-flicker {
          animation: flame-flicker 0.7s infinite alternate;
        }
        @keyframes flame-flicker {
          0% { opacity: 0.7; transform: scaleY(1); }
          100% { opacity: 1; transform: scaleY(1.3); }
        }
        .animate-fade-in {
          animation: fade-in 0.5s ease;
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
