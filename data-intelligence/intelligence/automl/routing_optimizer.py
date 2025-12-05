#!/usr/bin/env python3
"""
AutoML for Routing Optimization

Uses automated machine learning to optimize MoE routing decisions.
"""

import json
import numpy as np
from pathlib import Path
from typing import Dict, List, Tuple
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import LabelEncoder
import joblib
import optuna


class RoutingAutoML:
    """AutoML system for routing optimization"""

    def __init__(self, model_path: Optional[Path] = None):
        self.model_path = model_path or Path('data-intelligence/lakehouse/models/routing_automl.pkl')
        self.model = None
        self.label_encoder = LabelEncoder()
        self.feature_names = [
            'task_complexity_encoded',
            'priority_encoded',
            'keyword_count',
            'description_length',
            'has_code_keywords',
            'has_security_keywords',
            'estimated_tokens',
        ]

    def prepare_features(self, task_data: Dict) -> np.ndarray:
        """Extract features from task data"""
        # Encode complexity
        complexity_map = {'low': 0, 'medium': 1, 'high': 2}
        complexity = complexity_map.get(task_data.get('complexity', 'medium'), 1)

        # Encode priority
        priority_map = {'low': 0, 'medium': 1, 'high': 2, 'critical': 3}
        priority = priority_map.get(task_data.get('priority', 'medium'), 1)

        # Extract keywords
        description = task_data.get('description', '').lower()
        keywords = task_data.get('matched_keywords', [])

        # Code-related keywords
        code_keywords = ['implement', 'code', 'function', 'class', 'api', 'feature']
        has_code = any(kw in description for kw in code_keywords)

        # Security keywords
        security_keywords = ['security', 'vulnerability', 'cve', 'scan', 'audit']
        has_security = any(kw in description for kw in security_keywords)

        features = [
            complexity,
            priority,
            len(keywords),
            len(description),
            int(has_code),
            int(has_security),
            task_data.get('estimated_tokens', 5000),
        ]

        return np.array(features).reshape(1, -1)

    def train(self, training_data: List[Dict]):
        """Train AutoML model"""
        X = []
        y = []

        for task in training_data:
            features = self.prepare_features(task)
            X.append(features[0])
            y.append(task['assigned_master'])

        X = np.array(X)
        y_encoded = self.label_encoder.fit_transform(y)

        # Hyperparameter optimization with Optuna
        def objective(trial):
            params = {
                'n_estimators': trial.suggest_int('n_estimators', 50, 300),
                'max_depth': trial.suggest_int('max_depth', 3, 10),
                'min_samples_split': trial.suggest_int('min_samples_split', 2, 10),
                'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.3),
            }

            model = GradientBoostingClassifier(**params, random_state=42)
            score = cross_val_score(model, X, y_encoded, cv=5, scoring='accuracy').mean()
            return score

        study = optuna.create_study(direction='maximize')
        study.optimize(objective, n_trials=50, show_progress_bar=False)

        # Train final model with best params
        best_params = study.best_params
        self.model = GradientBoostingClassifier(**best_params, random_state=42)
        self.model.fit(X, y_encoded)

        # Save model
        self.save()

        return study.best_value

    def predict(self, task_data: Dict) -> Tuple[str, float]:
        """Predict best master for task"""
        if not self.model:
            self.load()

        features = self.prepare_features(task_data)
        prediction = self.model.predict(features)[0]
        probabilities = self.model.predict_proba(features)[0]

        master = self.label_encoder.inverse_transform([prediction])[0]
        confidence = float(probabilities[prediction])

        return master, confidence

    def explain_prediction(self, task_data: Dict) -> Dict:
        """Explain why a particular master was chosen"""
        features = self.prepare_features(task_data)
        master, confidence = self.predict(task_data)

        # Feature importances
        importances = self.model.feature_importances_
        feature_importance = {
            name: float(imp)
            for name, imp in zip(self.feature_names, importances)
        }

        return {
            'predicted_master': master,
            'confidence': confidence,
            'feature_importances': feature_importance,
            'top_features': sorted(
                feature_importance.items(),
                key=lambda x: x[1],
                reverse=True
            )[:3]
        }

    def save(self):
        """Save model to disk"""
        self.model_path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump({
            'model': self.model,
            'label_encoder': self.label_encoder,
            'feature_names': self.feature_names
        }, self.model_path)

    def load(self):
        """Load model from disk"""
        if self.model_path.exists():
            data = joblib.load(self.model_path)
            self.model = data['model']
            self.label_encoder = data['label_encoder']
            self.feature_names = data['feature_names']


if __name__ == '__main__':
    automl = RoutingAutoML()
    print("AutoML Routing Optimizer initialized")
