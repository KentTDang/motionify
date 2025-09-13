import React, { useState, useEffect } from 'react';

const Statistics = () => {
  const [weeklyData, setWeeklyData] = useState([]);
  const [sessions, setSessions] = useState([
    {
      id: 1,
      date: 'Today, 2:30 PM',
      duration: '3h 45m',
      quality: 'good',
      score: 87
    },
    {
      id: 2,
      date: 'Yesterday, 1:15 PM',
      duration: '5h 12m',
      quality: 'average',
      score: 72
    },
    {
      id: 3,
      date: 'Sep 11, 10:00 AM',
      duration: '7h 30m',
      quality: 'excellent',
      score: 95
    },
    {
      id: 4,
      date: 'Sep 10, 9:45 AM',
      duration: '6h 20m',
      quality: 'good',
      score: 84
    },
    {
      id: 5,
      date: 'Sep 9, 11:00 AM',
      duration: '4h 15m',
      quality: 'average',
      score: 68
    }
  ]);

  // Mock chart component
  const SimpleChart = () => {
    const data = [
      { day: 'Mon', score: 85 },
      { day: 'Tue', score: 92 },
      { day: 'Wed', score: 78 },
      { day: 'Thu', score: 88 },
      { day: 'Fri', score: 95 },
      { day: 'Sat', score: 82 },
      { day: 'Sun', score: 87 }
    ];

    return (
      <div className="simple-chart">
        <div className="chart-bars">
          {data.map((item, index) => (
            <div key={index} className="chart-bar-container">
              <div 
                className="chart-bar"
                style={{ 
                  height: `${item.score}%`,
                  backgroundColor: item.score >= 90 ? '#48bb78' : 
                                  item.score >= 80 ? '#4c51bf' : '#ed8936'
                }}
              ></div>
              <span className="chart-label">{item.day}</span>
              <span className="chart-value">{item.score}%</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const StatCard = ({ title, value, subtitle, trend }) => (
    <div className="stat-card">
      <h3>{title}</h3>
      <div className="big-stat">
        {value}
        {trend && (
          <span className={`trend ${trend > 0 ? 'positive' : 'negative'}`}>
            {trend > 0 ? '↗' : '↘'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <p>{subtitle}</p>
    </div>
  );

  const SessionItem = ({ session }) => (
    <div className="session-item">
      <div className="session-info">
        <span className="session-date">{session.date}</span>
        <span className="session-duration">{session.duration}</span>
      </div>
      <div className="session-metrics">
        <span className="session-score">{session.score}%</span>
        <span className={`session-quality ${session.quality}`}>
          {session.quality.charAt(0).toUpperCase() + session.quality.slice(1)}
        </span>
      </div>
    </div>
  );

  const PostureInsights = () => (
    <div className="posture-insights">
      <h3>Weekly Insights</h3>
      <div className="insights-list">
        <div className="insight-item positive">
          <div className="insight-icon">✅</div>
          <div className="insight-text">
            <strong>Great improvement!</strong> Your posture score increased by 12% this week.
          </div>
        </div>
        <div className="insight-item neutral">
          <div className="insight-icon">📊</div>
          <div className="insight-text">
            <strong>Peak hours:</strong> Your best posture is typically between 10 AM - 12 PM.
          </div>
        </div>
        <div className="insight-item warning">
          <div className="insight-icon">⚠️</div>
          <div className="insight-text">
            <strong>Watch out:</strong> Posture tends to decline after 3 PM. Consider more breaks.
          </div>
        </div>
      </div>
    </div>
  );

  const StreakCounter = () => (
    <div className="streak-counter">
      <div className="streak-display">
        <div className="streak-number">12</div>
        <div className="streak-label">Day Streak</div>
      </div>
      <div className="streak-calendar">
        <div className="calendar-week">
          {[1, 2, 3, 4, 5, 6, 7].map(day => (
            <div 
              key={day} 
              className={`calendar-day ${day <= 5 ? 'completed' : 'incomplete'}`}
            >
              {day <= 5 ? '✓' : '○'}
            </div>
          ))}
        </div>
        <p>Keep it up! 5 more days for a new record.</p>
      </div>
    </div>
  );

  return (
    <section className="tab-content active">
      <div className="statistics-container">
        <h2>Posture Statistics</h2>
        
        {/* Overview Stats */}
        <div className="stats-overview">
          <StatCard 
            title="This Week" 
            value="87%" 
            subtitle="Good Posture Time"
            trend={12}
          />
          <StatCard 
            title="Average Session" 
            value="6.2h" 
            subtitle="Daily Usage"
            trend={-3}
          />
          <StatCard 
            title="Streak" 
            value="12" 
            subtitle="Days Active"
            trend={8}
          />
          <StatCard 
            title="Breaks Taken" 
            value="89" 
            subtitle="This Week"
            trend={15}
          />
        </div>

        {/* Charts and Insights */}
        <div className="charts-container">
          <div className="chart-section">
            <h3>Weekly Posture Trends</h3>
            <SimpleChart />
          </div>
          
          <div className="insights-section">
            <PostureInsights />
            <StreakCounter />
          </div>
        </div>

        {/* Recent Sessions */}
        <div className="recent-sessions-section">
          <h3>Recent Sessions</h3>
          <div className="sessions-list">
            {sessions.map(session => (
              <SessionItem key={session.id} session={session} />
            ))}
          </div>
        </div>

        {/* Goals Section */}
        <div className="goals-section">
          <h3>Weekly Goals</h3>
          <div className="goals-grid">
            <div className="goal-card">
              <div className="goal-header">
                <span className="goal-title">Posture Score</span>
                <span className="goal-progress">87/90%</span>
              </div>
              <div className="goal-bar">
                <div className="goal-fill" style={{ width: '97%' }}></div>
              </div>
              <p>Almost there! 3% to reach your goal.</p>
            </div>
            
            <div className="goal-card">
              <div className="goal-header">
                <span className="goal-title">Daily Sessions</span>
                <span className="goal-progress">5/7 days</span>
              </div>
              <div className="goal-bar">
                <div className="goal-fill" style={{ width: '71%' }}></div>
              </div>
              <p>2 more days to complete your weekly goal.</p>
            </div>
            
            <div className="goal-card completed">
              <div className="goal-header">
                <span className="goal-title">Break Frequency</span>
                <span className="goal-progress">✓ Completed</span>
              </div>
              <div className="goal-bar">
                <div className="goal-fill" style={{ width: '100%' }}></div>
              </div>
              <p>Great job! You took regular breaks this week.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Statistics;
