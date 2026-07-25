import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Layout } from '../components/Layout';
import { Plus, X, Clock, MapPin, Calendar as CalIcon, Trash2 } from 'lucide-react';
import { useNotifications } from '../components/Notifications';
import { dataAPI } from '../lib/api';
import { detectLinks } from '../lib/messageLinks';
import { LinkBadges } from '../components/LinkBadges';

interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  location: string | null;
  is_all_day: boolean;
  created_by: string;
  is_global?: boolean;
  meeting_link?: string | null;
  event_type?: string | null;
}

interface CalendarTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  due_date: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export function Calendar() {
  const { user, isAdmin } = useAuth();
  const { showSuccess, showError, NotificationContainer } = useNotifications();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<CalendarTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    start_time: new Date().toISOString().split('T')[0],
    end_time: new Date().toISOString().split('T')[0],
    time: '09:00',
    is_all_day: false,
    meeting_link: '',
    is_global: false,
    event_type: 'todo',
  });

  useEffect(() => {
    if (user) {
      loadEvents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, currentMonth]);

  const loadEvents = async () => {
    if (!user) return;

    try {
      const monthStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
      const data = await dataAPI.getCalendarMonth(monthStr);
      setEvents(data?.events || []);
      setTasks(data?.tasks || []);
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEvent = async () => {
    if (!newEvent.title.trim() || !user) return;
    if (newEvent.is_global && !isAdmin) return;

    try {
      // Combine date and time
      const startDateTime = new Date(`${newEvent.start_time}T${newEvent.time}:00`);
      // Default end time to 1 hour later if on same day, or just use end date
      const endDateTime = new Date(`${newEvent.end_time}T${newEvent.time}:00`);
      if (startDateTime.toDateString() === endDateTime.toDateString()) {
        endDateTime.setHours(startDateTime.getHours() + 1);
      }

      await dataAPI.createCalendarEvent({
        title: newEvent.title.trim(),
        description: newEvent.description.trim() || undefined,
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        location: undefined,
        is_all_day: newEvent.is_all_day,
        meeting_link: newEvent.meeting_link.trim() || undefined,
        is_global: Boolean(newEvent.is_global),
        event_scope: newEvent.is_global ? 'company' : 'personal',
        event_type: newEvent.event_type || 'todo',
      });
      showSuccess('Event created successfully');
      setShowCreateEvent(false);
      setNewEvent({
        title: '',
        description: '',
        start_time: new Date().toISOString().split('T')[0],
        end_time: new Date().toISOString().split('T')[0],
        time: '09:00',
        is_all_day: false,
        meeting_link: '',
        is_global: false,
        event_type: 'todo',
      });
      loadEvents();
    } catch (error: any) {
      console.error('Error creating event:', error);
      showError(error.message || 'Failed to create event');
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm('Are you sure you want to delete this event?')) return;
    try {
      await dataAPI.deleteCalendarEvent(eventId);
      showSuccess('Event deleted successfully');
      loadEvents();
    } catch (error: any) {
      console.error('Error deleting event:', error);
      showError(error.message || 'Failed to delete event');
    }
  };

  const getDaysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

  const getFirstDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

  const monthEvents = events.filter(e => {
    const eventDate = new Date(e.start_time);
    return eventDate.getMonth() === currentMonth.getMonth() && eventDate.getFullYear() === currentMonth.getFullYear();
  });

  const monthTasks = tasks.filter(t => {
    const d = new Date(t.due_date);
    return d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear();
  });

  const days = Array.from({ length: getDaysInMonth(currentMonth) }, (_, i) => i + 1);
  const startingDayOfWeek = getFirstDayOfMonth(currentMonth);
  const emptyDays = Array.from({ length: startingDayOfWeek }, (_, i) => i);

  const todayKey = new Date().toDateString();
  const selectedKey = selectedDay.toDateString();

  const selectedDayItems = useMemo(() => {
    const dayStart = new Date(selectedDay);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(selectedDay);
    dayEnd.setHours(23, 59, 59, 999);
    const ev = events.filter((e) => {
      const t = new Date(e.start_time);
      return t >= dayStart && t <= dayEnd;
    });
    const ts = tasks.filter((t) => {
      const d = new Date(t.due_date);
      return d >= dayStart && d <= dayEnd;
    });
    return { ev, ts };
  }, [events, tasks, selectedDay]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <NotificationContainer />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Calendar</h1>
            <p className="text-gray-600 dark:text-gray-300 mt-1">Organizational events and schedules</p>
          </div>
          <button
            onClick={() => setShowCreateEvent(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>{isAdmin ? 'New Event / Meeting' : 'New Personal Todo'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                  className="px-3 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentMonth(new Date())}
                  className="px-3 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  Today
                </button>
                <button
                  onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                  className="px-3 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  Next
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-2 mb-4">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-center font-semibold text-gray-600 dark:text-gray-300 py-2">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {emptyDays.map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square" />
              ))}
              {days.map(day => {
                const dayEvents = monthEvents.filter(e => new Date(e.start_time).getDate() === day);
                const dayTasks = monthTasks.filter(t => new Date(t.due_date).getDate() === day);
                const cellDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
                const isToday = cellDate.toDateString() === todayKey;
                const isSelected = cellDate.toDateString() === selectedKey;
                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(cellDate)}
                    className={`aspect-square border rounded-lg p-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${isSelected ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'border-gray-200 dark:border-gray-700'
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className={`text-sm font-medium ${isToday ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'}`}>
                        {day}
                      </div>
                      {isToday && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-600 text-white">
                          Today
                        </span>
                      )}
                    </div>
                    <div className="mt-2 space-y-1">
                      {dayEvents.slice(0, 1).map(event => (
                        <div key={event.id} className="text-[11px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1 py-0.5 rounded truncate">
                          {event.is_global ? '📌 ' : ''}{event.title}
                        </div>
                      ))}
                      {dayTasks.slice(0, 1).map(task => (
                        <div key={task.id} className="text-[11px] bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 px-1 py-0.5 rounded truncate">
                          ⏳ {task.title}
                        </div>
                      ))}
                      {(dayEvents.length + dayTasks.length) > 2 && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          +{(dayEvents.length + dayTasks.length) - 2} more
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Selected Day</h3>
              <div className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2">
                <CalIcon className="w-4 h-4" />
                <span>{selectedDay.toLocaleDateString()}</span>
              </div>
            </div>

            <div className="space-y-3 max-h-[28rem] overflow-y-auto">
              {selectedDayItems.ev.length === 0 && selectedDayItems.ts.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-6">Nothing scheduled</p>
              ) : (
                <>
                  {selectedDayItems.ev.map((event) => (
                    <div key={event.id} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            {event.is_global ? 'Company: ' : ''}{event.title}
                          </p>
                          {event.description && <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{event.description}</p>}
                        </div>
                        <span className="text-xs px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                          {event.event_type || 'event'}
                        </span>
                        {((event.created_by === user?.id) || (isAdmin && event.is_global)) && (
                          <button
                            onClick={() => handleDeleteEvent(event.id)}
                            className="p-1 text-gray-400 dark:text-gray-500 hover:text-red-500 rounded transition-colors"
                            title="Delete event"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-300 mt-2 flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(event.start_time).toLocaleTimeString()}
                        </span>
                        {event.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {event.location}
                          </span>
                        )}
                      </div>

                      {event.meeting_link && (
                        <div className="mt-2 text-gray-700 dark:text-gray-200">
                          <LinkBadges links={detectLinks(event.meeting_link)} />
                        </div>
                      )}
                    </div>
                  ))}

                  {selectedDayItems.ts.map((task) => (
                    <div key={task.id} className="p-3 bg-orange-50 dark:bg-orange-900/30 rounded-lg border border-orange-200 dark:border-orange-800">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100">Task Due: {task.title}</p>
                          {task.description && <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{task.description}</p>}
                        </div>
                        <span className="text-xs px-2 py-1 rounded bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300">
                          {task.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        {showCreateEvent && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md max-h-96 overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Create Event</h3>
                <button onClick={() => setShowCreateEvent(false)}>
                  <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
              <div className="space-y-4">
                {isAdmin && (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={newEvent.is_global}
                      onChange={(e) => setNewEvent({ ...newEvent, is_global: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-200">Create as company-wide (global)</span>
                  </label>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Title</label>
                  <input
                    type="text"
                    value={newEvent.title}
                    onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Type</label>
                  <select
                    value={newEvent.event_type}
                    onChange={(e) => setNewEvent({ ...newEvent, event_type: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="todo">Todo</option>
                    <option value="meeting">Meeting</option>
                    <option value="reminder">Reminder</option>
                    <option value="work">Work</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Description</label>
                  <textarea
                    value={newEvent.description}
                    onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Date</label>
                    <input
                      type="date"
                      value={newEvent.start_time}
                      onChange={(e) => setNewEvent({ ...newEvent, start_time: e.target.value, end_time: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Time</label>
                    <input
                      type="time"
                      value={newEvent.time}
                      onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Meeting Link</label>
                  <input
                    type="url"
                    value={newEvent.meeting_link}
                    onChange={(e) => setNewEvent({ ...newEvent, meeting_link: e.target.value })}
                    placeholder="https://meet.google.com/... or https://teams.microsoft.com/..."
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={newEvent.is_all_day}
                    onChange={(e) => setNewEvent({ ...newEvent, is_all_day: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-200">All day event</span>
                </label>
                <button
                  onClick={handleCreateEvent}
                  disabled={!newEvent.title.trim()}
                  className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  Create Event
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
