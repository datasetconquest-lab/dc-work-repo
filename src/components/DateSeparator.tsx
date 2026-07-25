interface DateSeparatorProps {
    date: string | Date;
}

export function DateSeparator({ date }: DateSeparatorProps) {
    const formatDate = (dateString: string | Date) => {
        const d = new Date(dateString);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (d.toDateString() === today.toDateString()) {
            return 'Today';
        } else if (d.toDateString() === yesterday.toDateString()) {
            return 'Yesterday';
        } else {
            return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        }
    };

    return (
        <div className="flex items-center justify-center my-4">
            <div className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs px-3 py-1 rounded-full shadow-sm">
                {formatDate(date)}
            </div>
        </div>
    );
}
