import Link from 'next/link';
import { withBasePath } from '@/lib/base-path';

export default function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="text-sm text-gray-500 mb-4" aria-label="Breadcrumb">
      <ol className="list-none p-0 inline-flex">
        {items.map((item, idx) => (
          <li key={item.label} className="flex items-center">
            {item.href ? (
              <Link href={withBasePath(item.href)} className="hover:underline text-blue-700">
                {item.label}
              </Link>
            ) : (
              <span className="font-semibold text-neutral-800">{item.label}</span>
            )}
            {idx < items.length - 1 && <span className="mx-2">/</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
