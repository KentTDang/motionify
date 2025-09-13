import React, { useState } from 'react';

const Exercises = ({ exercises }) => {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [exerciseTimer, setExerciseTimer] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const categories = [
    { id: 'all', label: 'All Exercises' },
    { id: 'neck', label: 'Neck & Shoulders' },
    { id: 'back', label: 'Back' },
    { id: 'quick', label: 'Quick (2 min)' }
  ];

  const filteredExercises = selectedCategory === 'all' 
    ? exercises 
    : exercises.filter(ex => ex.category === selectedCategory);

  const ExerciseCard = ({ exercise }) => (
    <div 
      className="exercise-card"
      onClick={() => openExerciseModal(exercise)}
    >
      <h4>{exercise.title}</h4>
      <div className="exercise-meta">
        <span>⏱️ {exercise.duration}s</span>
        <span>📂 {exercise.category}</span>
      </div>
      <p className="exercise-description">{exercise.description}</p>
    </div>
  );

  const ExerciseModal = () => {
    if (!selectedExercise) return null;

    const startExerciseTimer = () => {
      setTimeLeft(selectedExercise.duration);
      setIsRunning(true);
      
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            setIsRunning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      setExerciseTimer(timer);
    };

    const skipExercise = () => {
      if (exerciseTimer) {
        clearInterval(exerciseTimer);
        setExerciseTimer(null);
      }
      setIsRunning(false);
      closeExerciseModal();
    };

    return (
      <div className="modal">
        <div className="modal-content">
          <div className="modal-header">
            <h3>{selectedExercise.title}</h3>
            <button 
              className="modal-close"
              onClick={closeExerciseModal}
            >
              &times;
            </button>
          </div>
          <div className="modal-body">
            <div className="exercise-timer">
              <div className="exercise-progress">
                <div className="progress-circle">
                  <span>{timeLeft || selectedExercise.duration}</span>
                </div>
              </div>
            </div>
            <div className="exercise-instructions">
              <p>{selectedExercise.description}</p>
              <div className="exercise-controls">
                {!isRunning && timeLeft === 0 && (
                  <button 
                    className="btn btn-primary"
                    onClick={startExerciseTimer}
                  >
                    Start
                  </button>
                )}
                {!isRunning && timeLeft === 0 && (
                  <button 
                    className="btn btn-secondary"
                    onClick={skipExercise}
                  >
                    Skip
                  </button>
                )}
                {timeLeft === 0 && !isRunning && exerciseTimer === null && (
                  <button 
                    className="btn btn-success"
                    onClick={() => {
                      // Find next exercise or close modal
                      const currentIndex = exercises.findIndex(ex => ex.id === selectedExercise.id);
                      if (currentIndex < exercises.length - 1) {
                        setSelectedExercise(exercises[currentIndex + 1]);
                        setTimeLeft(0);
                      } else {
                        closeExerciseModal();
                      }
                    }}
                  >
                    Next Exercise
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const openExerciseModal = (exercise) => {
    setSelectedExercise(exercise);
    setTimeLeft(0);
    setIsRunning(false);
    if (exerciseTimer) {
      clearInterval(exerciseTimer);
      setExerciseTimer(null);
    }
  };

  const closeExerciseModal = () => {
    setSelectedExercise(null);
    setTimeLeft(0);
    setIsRunning(false);
    if (exerciseTimer) {
      clearInterval(exerciseTimer);
      setExerciseTimer(null);
    }
  };

  return (
    <section className="tab-content active">
      <div className="exercises-container">
        <div className="exercises-header">
          <h2>Stretching Exercises</h2>
          <p>Follow these exercises to improve your posture and reduce strain</p>
        </div>
        
        <div className="exercise-categories">
          {categories.map(category => (
            <button
              key={category.id}
              className={`category-btn ${selectedCategory === category.id ? 'active' : ''}`}
              onClick={() => setSelectedCategory(category.id)}
            >
              {category.label}
            </button>
          ))}
        </div>

        <div className="exercises-grid">
          {filteredExercises.map(exercise => (
            <ExerciseCard key={exercise.id} exercise={exercise} />
          ))}
        </div>

        {/* Exercise Modal */}
        {selectedExercise && <ExerciseModal />}
      </div>
    </section>
  );
};

export default Exercises;
