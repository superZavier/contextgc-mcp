import React, { useState, useEffect, useCallback } from "react";
import { DataService } from "../services/DataService";
import type { User, UserProfile, UserSettings } from "../types";
import { validateEmail } from "../utils/validators";
import { formatCurrency } from "../utils/formatters";
import { logger } from "../utils/logger";

interface UserDashboardProps {
  userId: string;
  onLogout: () => void;
  theme?: "light" | "dark";
}

interface DashboardState {
  user: User | null;
  profile: UserProfile | null;
  settings: UserSettings | null;
  isLoading: boolean;
  error: string | null;
  notifications: Notification[];
}

// Custom hook for user data fetching
function useUserData(userId: string) {
  const [state, setState] = useState<Pick<DashboardState, "user" | "profile" | "settings" | "isLoading" | "error">>({
    user: null,
    profile: null,
    settings: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    const service = new DataService();

    async function fetchData() {
      try {
        const [user, profile, settings] = await Promise.all([
          service.getUser(userId),
          service.getProfile(userId),
          service.getSettings(userId),
        ]);
        if (!cancelled) {
          setState({ user, profile, settings, isLoading: false, error: null });
        }
      } catch (err) {
        if (!cancelled) {
          setState((prev) => ({ ...prev, isLoading: false, error: (err as Error).message }));
        }
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [userId]);

  return state;
}

// Notification component
const NotificationList: React.FC<{ notifications: Notification[]; onDismiss: (id: string) => void }> = ({
  notifications,
  onDismiss,
}) => {
  return (
    <div className="notification-list">
      {notifications.map((n) => (
        <div key={n.id} className={`notification notification-${n.type}`}>
          <span>{n.message}</span>
          <button onClick={() => onDismiss(n.id)}>×</button>
        </div>
      ))}
    </div>
  );
};

// User info card component
const UserInfoCard: React.FC<{ user: User; profile: UserProfile }> = ({ user, profile }) => {
  return (
    <div className="user-info-card">
      <img src={profile.avatarUrl} alt={user.name} className="avatar" />
      <h2>{user.name}</h2>
      <p className="email">{validateEmail(user.email) ? user.email : "Invalid email"}</p>
      <p className="balance">{formatCurrency(profile.balance)}</p>
      <p className="member-since">Member since {profile.createdAt.toLocaleDateString()}</p>
    </div>
  );
};

// Settings panel component
const SettingsPanel: React.FC<{ settings: UserSettings; onUpdate: (s: UserSettings) => void }> = ({
  settings,
  onUpdate,
}) => {
  const [localSettings, setLocalSettings] = useState(settings);

  const handleChange = (key: keyof UserSettings, value: any) => {
    const updated = { ...localSettings, [key]: value };
    setLocalSettings(updated);
    onUpdate(updated);
  };

  return (
    <div className="settings-panel">
      <h3>Settings</h3>
      <label>
        <input
          type="checkbox"
          checked={localSettings.emailNotifications}
          onChange={(e) => handleChange("emailNotifications", e.target.checked)}
        />
        Email Notifications
      </label>
      <label>
        <input
          type="checkbox"
          checked={localSettings.darkMode}
          onChange={(e) => handleChange("darkMode", e.target.checked)}
        />
        Dark Mode
      </label>
      <label>
        Language:
        <select
          value={localSettings.language}
          onChange={(e) => handleChange("language", e.target.value)}
        >
          <option value="en">English</option>
          <option value="zh">中文</option>
          <option value="ja">日本語</option>
        </select>
      </label>
    </div>
  );
};

// Main Dashboard component
export const UserDashboard: React.FC<UserDashboardProps> = ({ userId, onLogout, theme = "light" }) => {
  const { user, profile, settings, isLoading, error } = useUserData(userId);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    if (error) {
      logger.error("Dashboard error:", error);
    }
  }, [error]);

  const handleDismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const handleUpdateSettings = useCallback((newSettings: UserSettings) => {
    const service = new DataService();
    service.updateSettings(userId, newSettings).catch((err) => {
      logger.error("Failed to update settings:", err);
    });
  }, [userId]);

  if (isLoading) {
    return <div className="loading">Loading...</div>;
  }

  if (error) {
    return (
      <div className="error">
        <p>Error: {error}</p>
        <button onClick={onLogout}>Logout</button>
      </div>
    );
  }

  if (!user || !profile || !settings) {
    return <div className="no-data">No user data available</div>;
  }

  return (
    <div className={`dashboard dashboard-${theme}`}>
      <header className="dashboard-header">
        <h1>Dashboard</h1>
        <button onClick={onLogout} className="logout-btn">Logout</button>
      </header>

      <NotificationList notifications={notifications} onDismiss={handleDismissNotification} />

      <main className="dashboard-content">
        <UserInfoCard user={user} profile={profile} />
        <SettingsPanel settings={settings} onUpdate={handleUpdateSettings} />

        <section className="activity-section">
          <h3>Recent Activity</h3>
          <ActivityFeed userId={userId} />
        </section>
      </main>
    </div>
  );
};

// Activity feed component
const ActivityFeed: React.FC<{ userId: string }> = ({ userId }) => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const service = new DataService();
    service.getActivities(userId, page).then(setActivities).catch(() => {
      // silently fail
    });
  }, [userId, page]);

  return (
    <div className="activity-feed">
      {activities.length === 0 ? (
        <p>No recent activity</p>
      ) : (
        <ul>
          {activities.map((a) => (
            <li key={a.id} className="activity-item">
              <span className="activity-type">{a.type}</span>
              <span className="activity-desc">{a.description}</span>
              <time>{a.timestamp.toLocaleString()}</time>
            </li>
          ))}
        </ul>
      )}
      <button onClick={() => setPage((p) => p + 1)} disabled={activities.length < 10}>
        Load More
      </button>
    </div>
  );
};

export default UserDashboard;
