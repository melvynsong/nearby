
"use client"

import React from 'react';

// Serializable subset of ShowcaseConfig — safe to pass from Server → Client
export type ShowcaseCardProps = {
	key: string;
	title: string;
	editorialDescription: string;
	categoryUsageCount?: number;
	tagline: string;
	heroGradientFrom: string;
	heroGradientTo: string;
	emoji: string;
};

type Props = { config: ShowcaseCardProps; index: number; onExplore?: () => void };

export default function ShowcaseOptionCard({ config, index, onExplore }: Props) {
	const delay = index * 120;
	return (
		<div
			className="group relative flex flex-col sm:flex-row items-stretch justify-between overflow-hidden rounded-3xl min-h-[280px] cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-white/50 shadow-xl border border-white/10 transition-transform duration-300 hover:-translate-y-1 hover:shadow-2xl bg-gradient-to-br"
			style={{
				animationDelay: `${delay}ms`,
				background: `linear-gradient(145deg, ${config.heroGradientFrom}, ${config.heroGradientTo})`,
			}}
			tabIndex={0}
			role="button"
			aria-label={`Explore ${config.title}`}
			onClick={() => {
				if (typeof window !== 'undefined') {
					console.log('[ShowcaseOptionCard] Explore clicked:', config.title);
				}
				if (typeof onExplore === 'function') onExplore();
			}}
			onKeyDown={(e) => {
				if ((e.key === 'Enter' || e.key === ' ') && typeof onExplore === 'function') {
					onExplore();
				}
			}}
		>
			<div
				className="absolute inset-0 opacity-20 pointer-events-none"
				style={{
					backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(255,255,255,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.08) 0%, transparent 50%)',
				}}
			/>
			<div className="flex flex-col items-center justify-center sm:pl-8 pt-8 sm:pt-0 sm:pr-0 pr-8">
				<span className="text-7xl sm:text-8xl drop-shadow-lg animate-bounce-slow" aria-hidden>{config.emoji}</span>
			</div>
			<div className="relative z-10 flex-1 flex flex-col justify-center p-7 sm:pl-0 sm:pr-10">
				<span className="mb-3 inline-flex items-center rounded-full bg-white/20 px-4 py-1 text-xs font-bold uppercase tracking-widest text-white/90 shadow-sm">
					{config.tagline}
				</span>
				<h2 className="text-3xl sm:text-4xl font-extrabold leading-tight text-white drop-shadow-md mb-2">
					{config.title}
				</h2>
				<p className="mt-1 text-base sm:text-lg leading-relaxed text-white/85 line-clamp-3">
					{config.editorialDescription}
				</p>
				<div className="mt-7 flex items-center gap-3">
					<span className="rounded-full bg-gradient-to-r from-yellow-400 via-yellow-300 to-yellow-500 px-6 py-2 text-base font-bold text-neutral-900 shadow-lg transition-all duration-200 group-hover:from-yellow-500 group-hover:to-yellow-400 group-hover:scale-105">
						Explore
					</span>
					<svg
						viewBox="0 0 24 24"
						className="h-5 w-5 text-white/80 transition-transform duration-300 group-hover:translate-x-1"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					>
						<path d="M5 12h14M12 5l7 7-7 7" />
					</svg>
				</div>
			</div>
			<div className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 pointer-events-none"
				style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.09) 0%, transparent 60%)' }}
			/>
		</div>
	);
}
