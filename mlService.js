/**
 * Simulated ML Models for GigShield 
 * Replicates outputs of models like XGBoost and Isolation Forest
 */

class MLModelService {

    /**
     * Simulated XGBoost Regressor for dynamic risk-based premium prediction.
     * Predicts daily premium based on categorical and numerical features.
     * @param {Object} profile - { workType }
     * @returns {Object} { predicted_premium: number, riskFactors: Array, baseline: number }
     */
    static predictRiskPremium(profile) {
        let premium = 3.00;
        let features = [];
        
        // Feature 1: Work Type Risk
        const workTypeWeights = {
            'Swiggy/Zomato': 1.0, 
            'Zepto/Blinkit': 1.5, 
            'Uber/Ola': 2.5,     
            'Porter': 2.0         
        };

        const workRisk = workTypeWeights[profile.workType] || 1.0;
        premium += workRisk;
        features.push({ name: 'Work Category', impact: workRisk, description: `Impact of ${profile.workType}` });

        // Feature 2: Time of Day 
        const currentHour = new Date().getHours();
        if (currentHour >= 21 || currentHour <= 5) {
            premium += 1.5;
            features.push({ name: 'Night Shift', impact: 1.5, description: 'Elevated risk due to low visibility' });
        } else {
            features.push({ name: 'Day Shift', impact: 0, description: 'Standard driving conditions' });
        }

        // Feature 3: Complex Model Residuals
        const noise = (Math.random() * 0.5).toFixed(2);
        premium += parseFloat(noise);
        features.push({ name: 'Locational Density', impact: parseFloat(noise), description: 'Micro-local traffic prediction' });

        return {
            predicted_premium: parseFloat(premium.toFixed(2)),
            baseline: 3.00,
            xgboost_feature_importance: features
        };
    }

    /**
     * Simulated Isolation Forest for Fraud Anomaly Detection
     * @param {Object} claimData - { incidentType, amount }
     * @returns {Object} { isAnomaly: boolean, fraudScore: number, reason: string }
     */
    static predictFraudAnomaly(claimData) {
        let fraudScore = 15; 

        if (claimData.amount > 40000) {
            fraudScore += 45;
        }

        if (claimData.incidentType && claimData.incidentType.toLowerCase().includes('loss_pay')) {
            fraudScore += 25; 
        }

        if (Math.random() > 0.8) {
            fraudScore += 30; 
        }

        fraudScore = Math.min(100, fraudScore);
        const isAnomaly = fraudScore >= 75; 

        return {
            fraudScore,
            isAnomaly,
            reason: isAnomaly ? 'Claim pattern deviates from nominal distribution (Isolation Forest path length anomaly).' : 'Normal pattern'
        };
    }
}

module.exports = MLModelService;
