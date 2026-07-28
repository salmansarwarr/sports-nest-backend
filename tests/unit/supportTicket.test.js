const SupportTicket = require('../../src/models/SupportTicket');
const User = require('../../src/models/User');
const AuditLog = require('../../src/models/AuditLog');
const {
    createTicket,
    getTickets,
    getTicket,
    addMessage,
    updateTicketStatus,
} = require('../../src/controllers/supportTicketController');

describe('Support Ticket Controller', () => {
    let mockReq, mockRes, mockNext;
    let user, otherUser, admin;

    beforeEach(async () => {
        user = await User.create({ firstName: 'Regular', lastName: 'User', email: 'ticketuser@example.com', password: 'Password123!' });
        otherUser = await User.create({ firstName: 'Other', lastName: 'User', email: 'ticketother@example.com', password: 'Password123!' });
        admin = await User.create({ firstName: 'Admin', lastName: 'User', email: 'ticketadmin@example.com', password: 'Password123!', role: 'admin' });

        mockReq = { body: {}, params: {}, query: {}, user: null };
        mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        mockNext = jest.fn();
    });

    describe('createTicket', () => {
        it('should create a ticket for the authenticated user', async () => {
            mockReq.user = user;
            mockReq.body = { subject: 'Refund not received', category: 'refund-dispute', description: 'I cancelled but got no refund.' };

            await createTicket(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(201);
            const ticket = await SupportTicket.findOne({ user: user._id });
            expect(ticket.category).toBe('refund-dispute');
            expect(ticket.status).toBe('open');
        });
    });

    describe('getTickets', () => {
        beforeEach(async () => {
            await SupportTicket.create({ user: user._id, subject: 'Ticket 1', description: 'desc' });
            await SupportTicket.create({ user: otherUser._id, subject: 'Ticket 2', description: 'desc' });
        });

        it("should scope a regular user's list to their own tickets", async () => {
            mockReq.user = user;
            await getTickets(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, count: 1 }));
        });

        it('should let an admin see all tickets', async () => {
            mockReq.user = admin;
            await getTickets(mockReq, mockRes, mockNext);

            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, count: 2 }));
        });
    });

    describe('getTicket', () => {
        it('should not allow an unrelated user to view a ticket', async () => {
            const ticket = await SupportTicket.create({ user: user._id, subject: 'Private', description: 'desc' });

            mockReq.user = otherUser;
            mockReq.params = { id: ticket._id.toString() };

            await getTicket(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(403);
        });
    });

    describe('addMessage', () => {
        it('should let the ticket owner add a message and reopen a resolved ticket', async () => {
            const ticket = await SupportTicket.create({ user: user._id, subject: 'Resolved issue', description: 'desc', status: 'resolved' });

            mockReq.user = user;
            mockReq.params = { id: ticket._id.toString() };
            mockReq.body = { message: 'Actually still broken' };

            await addMessage(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(201);
            const updated = await SupportTicket.findById(ticket._id);
            expect(updated.messages).toHaveLength(1);
            expect(updated.status).toBe('open');
        });

        it('should reject a message from an unrelated user', async () => {
            const ticket = await SupportTicket.create({ user: user._id, subject: 'Private', description: 'desc' });

            mockReq.user = otherUser;
            mockReq.params = { id: ticket._id.toString() };
            mockReq.body = { message: 'Not my ticket' };

            await addMessage(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(403);
        });
    });

    describe('updateTicketStatus', () => {
        it('should let an admin update status and record an audit log entry', async () => {
            const ticket = await SupportTicket.create({ user: user._id, subject: 'Issue', description: 'desc' });

            mockReq.user = admin;
            mockReq.params = { id: ticket._id.toString() };
            mockReq.body = { status: 'resolved' };

            await updateTicketStatus(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            const updated = await SupportTicket.findById(ticket._id);
            expect(updated.status).toBe('resolved');
            expect(updated.resolvedAt).toBeDefined();

            const auditEntry = await AuditLog.findOne({ action: 'support_ticket.status_changed', resourceId: ticket._id });
            expect(auditEntry).not.toBeNull();
        });
    });
});
