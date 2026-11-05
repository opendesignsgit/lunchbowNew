import React, { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@windmill/react-ui";
import { FiBell } from "react-icons/fi";
import { Link, useHistory } from "react-router-dom";

import AdminOpsServices from "@/services/AdminOpsServices";
import { fmtDateTime, notificationLink, severityBadgeType, severityRowClass } from "@/utils/adminOps";

const POLL_MS = 60 * 1000;

/**
 * Header bell: unread count polled every 60s from /admin-ops/notifications/unread-count,
 * dropdown with the latest 5, mark-read on click, "Mark all read".
 */
const NotificationBell = () => {
  const history = useHistory();
  const ref = useRef();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadCount = useCallback(async () => {
    try {
      const res = await AdminOpsServices.getUnreadCount();
      setCount(Number(res?.count) || 0);
    } catch (err) {
      // stay quiet in the header; the page itself reports errors
    }
  }, []);

  const loadLatest = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AdminOpsServices.getNotifications({ limit: 5, page: 1 });
      setItems(res?.data || []);
    } catch (err) {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCount();
    const timer = setInterval(loadCount, POLL_MS);
    const onFocus = () => loadCount();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadCount]);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) loadLatest();
  };

  const openItem = async (n) => {
    setOpen(false);
    if (!n.read) {
      setItems((list) => list.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
      setCount((c) => Math.max(0, c - 1));
      try {
        await AdminOpsServices.markNotificationRead(n._id);
      } catch (err) {
        // ignore; the count is re-polled
      }
    }
    history.push(notificationLink(n));
  };

  const markAll = async () => {
    try {
      await AdminOpsServices.markAllNotificationsRead();
      setCount(0);
      setItems((list) => list.map((x) => ({ ...x, read: true })));
    } catch (err) {
      // ignore
    }
  };

  return (
    <li className="relative inline-block text-left" ref={ref}>
      <button className="relative align-middle rounded-md focus:outline-none" onClick={toggle} aria-label="Notifications">
        <FiBell className="w-5 h-5 text-emerald-500" aria-hidden="true" />
        {count > 0 && (
          <span className="absolute z-10 top-0 right-0 inline-flex items-center justify-center p-1 h-5 min-w-[1.25rem] text-xs font-medium leading-none text-red-100 transform -translate-x-1/2 -translate-y-1/2 bg-red-500 rounded-full">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="origin-top-right absolute md:right-0 -right-3 top-2 mt-6 rounded-md shadow-lg bg-white dark:bg-gray-800 focus:outline-none md:w-400 w-300 z-50 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-700">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Notifications</span>
            <button type="button" onClick={markAll} className="text-xs text-emerald-600 hover:underline focus:outline-none" disabled={count === 0}>
              Mark all read
            </button>
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {loading && items.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-gray-500">Loading...</li>
            ) : items.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-gray-500">No notifications</li>
            ) : (
              items.map((n) => (
                <li
                  key={n._id}
                  className={`px-3 py-2 border-b border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 ${severityRowClass(n.severity)} ${
                    n.read ? "" : "bg-emerald-50/40 dark:bg-gray-900"
                  }`}
                  onClick={() => openItem(n)}
                >
                  <div className="flex items-center gap-2">
                    <Badge type={severityBadgeType(n.severity)}>{n.severity}</Badge>
                    <span className={`text-sm truncate ${n.read ? "text-gray-600 dark:text-gray-300" : "font-semibold text-gray-800 dark:text-gray-100"}`}>{n.title}</span>
                  </div>
                  {n.message && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>}
                  <p className="text-xs text-gray-400 mt-0.5">{fmtDateTime(n.createdAt)}</p>
                </li>
              ))
            )}
          </ul>
          <div className="text-center py-2">
            <Link onClick={() => setOpen(false)} to="/notifications" className="text-sm text-emerald-600 hover:underline">
              Show all notifications
            </Link>
          </div>
        </div>
      )}
    </li>
  );
};

export default NotificationBell;
