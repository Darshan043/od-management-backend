const cron = require('node-cron');
const ODRequest = require('./models/ODRequest');

const startEscalationScheduler = () => {
    // Run every hour
    cron.schedule('0 * * * *', async () => {
        console.log('Running Auto Escalation Check...');
        try {
            const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

            // Find requests that haven't been acted upon for > 12 hours
            // and are not yet final approved or rejected.
            const pendingRequests = await ODRequest.find({
                status: { $nin: ['HOD_APPROVED', 'REJECTED'] },
                lastActionTime: { $lt: twelveHoursAgo },
                isFinalApproved: false
            });

            for (const request of pendingRequests) {
                let escalated = false;

                if (request.approvalLevel === 'faculty') {
                    request.approvalLevel = 'coordinator';
                    request.lastActionTime = Date.now();
                    escalated = true;
                    console.log(`Escalated OD ${request._id} from Faculty to Coordinator`);
                } else if (request.approvalLevel === 'coordinator') {
                    request.approvalLevel = 'hod';
                    request.lastActionTime = Date.now();
                    escalated = true;
                    console.log(`Escalated OD ${request._id} from Coordinator to HOD`);
                }

                if (escalated) {
                    await request.save();
                }
            }
        } catch (error) {
            console.error('Error in Auto Escalation Scheduler:', error);
        }
    });
};

module.exports = startEscalationScheduler;
