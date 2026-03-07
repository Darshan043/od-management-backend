const ODRequest = require('../models/ODRequest');
const asyncHandler = require('../middleware/asyncHandler');
const PDFDocument = require('pdfkit-table');
const axios = require('axios');

// @desc    Generate Admin OD Report PDF
// @route   GET /api/admin/od-report-pdf
// @access  Private/Admin
const getODReportPDF = asyncHandler(async (req, res) => {
    const ods = await ODRequest.find({ status: 'HOD_APPROVED' })
        .populate('student', 'name regNo department')
        .populate('approvedBy.faculty', 'name role')
        .sort('-createdAt');

    // Margins: 40 left/right => usable width = 595 - 80 = 515
    const margin = 40;
    const doc = new PDFDocument({ margin, size: 'A4' });

    // Set response headers
    const filename = `OD_System_Report_${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    doc.pipe(res);

    // ─── HEADER ────────────────────────────────────────────────────────────────
    const pageWidth = doc.page.width; // 595
    const headerTop = 30;
    const logoSize = 55;

    // Fetch and add logo (left-aligned)
    try {
        const logoUrl = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSlef5BYGvzVA5NBY76wsPpHRC4UUwJ2HEdbQ&s';
        const response = await axios.get(logoUrl, { responseType: 'arraybuffer' });
        const logoBuffer = Buffer.from(response.data);
        doc.image(logoBuffer, margin, headerTop, { width: logoSize, height: logoSize });
    } catch (error) {
        console.error('Failed to load logo for PDF:', error);
    }

    // Institution name & details — centered across full page width
    const textStartX = margin + logoSize + 10;
    const textAreaWidth = pageWidth - textStartX - margin;

    doc.font('Helvetica-Bold')
        .fontSize(17)
        .text('RAJALAKSHMI INSTITUTE OF TECHNOLOGY', textStartX, headerTop + 4, {
            width: textAreaWidth,
            align: 'left',
        });

    doc.font('Helvetica')
        .fontSize(9)
        .text('An Autonomous Institution | Affiliated to Anna University', textStartX, headerTop + 26, {
            width: textAreaWidth,
            align: 'left',
        });

    doc.fontSize(9)
        .text('Kuthambakkam, Chennai - 600 124', textStartX, headerTop + 38, {
            width: textAreaWidth,
            align: 'left',
        });

    // Horizontal divider
    const dividerY = headerTop + logoSize + 10;
    doc.moveTo(margin, dividerY).lineTo(pageWidth - margin, dividerY).lineWidth(0.8).stroke();

    // Document title
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold')
        .fontSize(13)
        .text('OFFICIAL ON-DUTY SYSTEM RECORD EXTRACT', margin, dividerY + 12, {
            align: 'center',
            underline: true,
            width: pageWidth - margin * 2,
        });

    // Stats row
    doc.moveDown(0.8);
    doc.font('Helvetica').fontSize(10);
    doc.text(`Total ODs Issued: ${ods.length}`);
    doc.text(`Date Generated: ${new Date().toLocaleString('en-GB')}`);
    doc.moveDown(0.8);

    // ─── TABLE ────────────────────────────────────────────────────────────────
    // Total usable width = 515. Column widths must sum to ≤ 515.
    //  S.No(28) + Name(95) + RegNo(75) + Dept(45) + Date(110) + Reason(100) + Status(62) = 515
    const tableData = {
        title: 'Approved OD Records',
        headers: [
            { label: 'S.No', property: 'sno', width: 28, align: 'center' },
            { label: 'Student Name', property: 'name', width: 95, align: 'left' },
            { label: 'Reg No', property: 'regNo', width: 75, align: 'left' },
            { label: 'Dept', property: 'dept', width: 45, align: 'center' },
            { label: 'OD Date(s)', property: 'date', width: 110, align: 'center' },
            { label: 'Reason', property: 'reason', width: 100, align: 'left' },
            { label: 'Status', property: 'status', width: 62, align: 'center' },
        ],
        datas: ods.map((od, index) => ({
            sno: (index + 1).toString(),
            name: od.student ? od.student.name : 'N/A',
            regNo: od.student ? od.student.regNo : 'N/A',
            dept: od.student ? od.student.department : 'N/A',
            date: `${new Date(od.fromDate).toLocaleDateString('en-GB')} - ${new Date(od.toDate).toLocaleDateString('en-GB')}`,
            reason: od.reason,
            status: od.status.replace(/_/g, ' '),
        })),
    };

    await doc.table(tableData, {
        prepareHeader: () => doc.font('Helvetica-Bold').fontSize(9),
        prepareRow: (_row, _indexColumn, _indexRow, _rectRow, _rectCell) => {
            doc.font('Helvetica').fontSize(8);
        },
        padding: 5,
    });

    doc.moveDown(2);

    // ─── FOOTER / SIGNATURE ───────────────────────────────────────────────────
    const signatureY = doc.page.height - 110;
    doc.font('Helvetica').fontSize(10);
    doc.text('__________________________', pageWidth - margin - 160, signatureY);
    doc.text('Authorized Administrator', pageWidth - margin - 160, signatureY + 15);
    doc.text('System Digital Signature', pageWidth - margin - 160, signatureY + 28);

    // Footer note
    doc.moveTo(margin, doc.page.height - 60).lineTo(pageWidth - margin, doc.page.height - 60).lineWidth(0.5).stroke();
    doc.font('Helvetica-Oblique').fontSize(7.5)
        .text(
            'This is a system-generated record extract from the RIT On-Duty Management Portal. No physical signature is required.',
            margin,
            doc.page.height - 48,
            { align: 'center', width: pageWidth - margin * 2 }
        );

    doc.end();
});

module.exports = { getODReportPDF };
