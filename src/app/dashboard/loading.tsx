export default function Loading() {
    return (
        <div className="animate-pulse space-y-6 p-4 w-full">
            {/* Header Skeleton */}
            <div className="flex justify-between items-center mb-6">
                <div className="h-10 w-64 bg-stone-800 rounded-lg"></div>
                <div className="h-10 w-32 bg-stone-800 rounded-lg"></div>
            </div>

            {/* Cards Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-32 bg-stone-800 rounded-xl"></div>
                ))}
            </div>

            {/* Main Content Area Skeleton */}
            <div className="h-96 bg-stone-800 rounded-xl w-full mt-6"></div>
        </div>
    )
}
