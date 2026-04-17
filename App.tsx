import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, Printer, Settings } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function numberToArabicWords(number: number | string): string {
  if (number === null || number === undefined || number === '') return '';
  const num = Math.round(Number(number));
  if (isNaN(num)) return String(number);

  if (num === 0) return 'صفر';
  if (num === 100) return 'مائة';

  const units = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];

  if (num < 20) {
    return units[num];
  }

  const digit = num % 10;
  const ten = Math.floor(num / 10);

  if (digit === 0) {
    return tens[ten];
  }

  return units[digit] + ' و' + tens[ten];
}

interface StudentRecord {
  id: number;
  name: string;
  n: string;
  a: string;
  m: string;
  activity: string;
  sa3y: string;
  text: string;
}

export default function App() {
  const [institute, setInstitute] = useState('المعهد التقني بعقوبة');
  const [department, setDepartment] = useState('قسم التقنيات الطاقة المتجددة');
  const [stage, setStage] = useState('الثانية');
  const [course, setCourse] = useState('الكورس الثاني');
  const [academicYear, setAcademicYear] = useState('2025-2026');
  const [subject, setSubject] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [isExporting, setIsExporting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  
  const [students, setStudents] = useState<StudentRecord[]>([]);

  // Split students into pages
  const pages: StudentRecord[][] = [];
  for (let i = 0; i < students.length; i += rowsPerPage) {
    pages.push(students.slice(i, i + rowsPerPage));
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });
      
      const parsedStudents: StudentRecord[] = [];
      
      let nameColIdx = -1;
      let startRow = 0;

      // Find dynamically the row that acts as the header constraint
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (!row) continue;
        
        // Find if this row has "الاسم"
        const idx = row.findIndex((c: any) => typeof c === 'string' && c.includes('الاسم'));
        if (idx !== -1) {
          nameColIdx = idx;
          startRow = i + 1;
          
          // Sometimes the sub-headers ('ن', 'ع', 'م') are on the following row
          if (startRow < data.length) {
              const nextRow = data[startRow];
              if (nextRow && nextRow.some((c: any) => typeof c === 'string' && (c.includes('ن') || c.includes('ع') || c.includes('الدرجة')))) {
                  startRow++;
              }
          }
          break;
        }
      }

      // Fallback if 'الاسم' was not found at all
      if (nameColIdx === -1) {
        nameColIdx = 0;
        startRow = 1;
      }

      for (let i = startRow; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;
        
        // Find the actual name
        let name = row[nameColIdx] !== undefined ? String(row[nameColIdx]).trim() : '';
        
        // If the expected name column is empty, but there's a string nearby, adjust slightly for weird excel merges
        if (!name && row[nameColIdx + 1] !== undefined && typeof row[nameColIdx + 1] === 'string') {
          name = String(row[nameColIdx + 1]).trim();
        }

        if (!name || name === '') continue;

        // Skip noise rows that might look like data but are actually headers wrapping around
        if (name.includes('الاسم') || name === 'ت' || name.includes('المعهد') || name.includes('مادة') || name.includes('طالب')) {
           continue; 
        }

        // Collect all available columns after the name
        const remainingCols: any[] = [];
        for (let j = nameColIdx + 1; j < row.length; j++) {
            if (row[j] !== undefined) {
                remainingCols.push(row[j]);
            }
        }
        
        let n: string = '';
        let a: string = '';
        let m: string = '';
        let activity: string = '';
        let sa3y: string = '';

        // Safely extract backwards or structurally
        if (remainingCols.length === 1) {
          sa3y = String(remainingCols[0]);
        } else if (remainingCols.length === 2) {
          activity = String(remainingCols[0]);
          sa3y = String(remainingCols[1]);
        } else if (remainingCols.length >= 3) {
          n = String(remainingCols[0]);
          a = String(remainingCols[1]);
          m = String(remainingCols[2]);
          activity = remainingCols.length > 3 ? String(remainingCols[3]) : '';
          sa3y = remainingCols.length > 4 ? String(remainingCols[4]) : String(remainingCols[remainingCols.length - 1]);
        }

        parsedStudents.push({
          id: parsedStudents.length + 1,
          name: name,
          n: n,
          a: a,
          m: m,
          activity: activity,
          sa3y: sa3y,
          text: numberToArabicWords(sa3y)
        });
      }
      setStudents(parsedStudents);
    };
    reader.readAsBinaryString(file);
  };

  const handlePrint = async () => {
    // Basic window.print() doesn't always work robustly in all iframe contexts (especially in preview).
    // Let's implement an explicit PDF generation fallback via html2canvas and jspdf.
    
    // First, try standard print as it produces the highest quality text layout usually
    try {
        window.print();
        return; // if this executes without blocking
    } catch(e) {
        console.warn("Direct print failed, falling back to PDF generation", e);
    }
  };

  const exportExcel = async () => {
    if (isExporting) return;
    setIsExporting(true);

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('التقرير', {
        views: [{ rightToLeft: true }], // RTL for Arabic sheet
        pageSetup: {
          paperSize: 9, // A4
          orientation: 'portrait',
          margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }
        }
      });

      // Columns Width Configuration
      worksheet.columns = [
        { width: 5 },  // ت
        { width: 35 }, // الاسم الرباعي
        { width: 6 },  // ن
        { width: 6 },  // ع
        { width: 6 },  // م
        { width: 10 }, // النشاط
        { width: 10 }, // السعي
        { width: 35 }  // السعي كتابة
      ];

      pages.forEach((pageStudents, pageIndex) => {
        // Find where to start this new page
        const startRowIndex = worksheet.lastRow ? worksheet.lastRow.number + 2 : 1; 
        
        let rIdx = startRowIndex;

        // --- Row 1: Top Header ---
        const r1 = worksheet.getRow(rIdx);
        r1.height = 30;
        r1.getCell(1).value = `المرحلة : ${stage}`;
        worksheet.mergeCells(rIdx, 1, rIdx, 3);
        
        r1.getCell(4).value = `السعي السنوي لمادة : ${subject}`;
        worksheet.mergeCells(rIdx, 4, rIdx, 6);
        r1.getCell(4).font = { name: 'Arial', bold: true, size: 14 };

        r1.getCell(7).value = institute;
        worksheet.mergeCells(rIdx, 7, rIdx, 8);
        rIdx++;

        // --- Row 2: Mid Header ---
        const r2 = worksheet.getRow(rIdx);
        r2.height = 30;
        r2.getCell(1).value = `${course} / العام الدراسي ( ${academicYear} )`;
        worksheet.mergeCells(rIdx, 1, rIdx, 3);

        r2.getCell(4).value = department;
        worksheet.mergeCells(rIdx, 4, rIdx, 8);
        rIdx++;

        // Apply shared Header style
        for (let j = startRowIndex; j < rIdx; j++) {
            const row = worksheet.getRow(j);
            row.eachCell((cell) => {
                cell.font = cell.font || { name: 'Arial', bold: true, size: 12 };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.border = { top: { style: 'medium' }, left: { style: 'medium' }, bottom: { style: 'medium' }, right: { style: 'medium' } };
            });
        }

        // --- Table Headers (Rows 3 & 4) ---
        const r3 = worksheet.getRow(rIdx);
        const r4 = worksheet.getRow(rIdx + 1);
        r3.height = 25;
        r4.height = 25;

        r3.getCell(1).value = 'ت';
        worksheet.mergeCells(rIdx, 1, rIdx + 1, 1);

        r3.getCell(2).value = 'الاسم الرباعي';
        worksheet.mergeCells(rIdx, 2, rIdx + 1, 2);

        r3.getCell(3).value = 'الدرجة';
        worksheet.mergeCells(rIdx, 3, rIdx, 5);
        r4.getCell(3).value = 'ن';
        r4.getCell(4).value = 'ع';
        r4.getCell(5).value = 'م';

        r3.getCell(6).value = 'النشاط\n%10';
        worksheet.mergeCells(rIdx, 6, rIdx + 1, 6);

        r3.getCell(7).value = 'السعي\n%40';
        worksheet.mergeCells(rIdx, 7, rIdx + 1, 7);

        r3.getCell(8).value = 'السعي كتابة';
        worksheet.mergeCells(rIdx, 8, rIdx + 1, 8);

        // Apply grid headers style
        [rIdx, rIdx + 1].forEach(rowNum => {
            const row = worksheet.getRow(rowNum);
            row.eachCell({ includeEmpty: true }, (cell) => {
                cell.font = { name: 'Arial', bold: true, size: 12 };
                cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                cell.border = { top: { style: 'medium' }, left: { style: 'medium' }, bottom: { style: 'medium' }, right: { style: 'medium' } };
            });
        });
        rIdx += 2;

        // --- Data Rows ---
        pageStudents.forEach((student) => {
           const row = worksheet.getRow(rIdx);
           row.height = 22;
           row.getCell(1).value = student.id;
           row.getCell(2).value = student.name;
           row.getCell(3).value = student.n;
           row.getCell(4).value = student.a;
           row.getCell(5).value = student.m;
           row.getCell(6).value = student.activity;
           row.getCell(7).value = student.sa3y;
           row.getCell(8).value = student.text;

           row.eachCell((cell, colNum) => {
              cell.font = { name: 'Arial', bold: colNum !== 8, size: 12 };
              cell.alignment = { 
                vertical: 'middle', 
                horizontal: colNum === 2 || colNum === 8 ? 'right' : 'center', 
                wrapText: true 
              };
              cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
           });
           rIdx++;
        });

        // --- Footer Row 1 ---
        rIdx += 1;
        const f1 = worksheet.getRow(rIdx);
        f1.height = 25;
        f1.getCell(2).value = 'توقيع مدرس المادة';
        f1.getCell(5).value = `الصفحة ${pageIndex + 1} من ${pages.length}`;
        f1.getCell(8).value = 'رئيس القسم';

        // --- Footer Row 2 ---
        rIdx += 2;
        const f2 = worksheet.getRow(rIdx);
        f2.height = 25;
        f2.getCell(2).value = 'الاسم :';
        f2.getCell(8).value = 'الاسم :';

        // Apply footer styling
        [f1, f2].forEach(r => {
            r.eachCell((cell) => {
                cell.font = { name: 'Arial', bold: true, size: 12 };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
            });
        });
        rIdx++;

      });

      // trigger download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `السعي_السنوي_${subject}_${stage}.xlsx`);

    } catch(e) {
      console.error("Excel generation failed", e);
      alert("حدث خطأ أثناء إنشاء ملف الإكسل");
    } finally {
      setIsExporting(false);
    }
  };

  const exportPDF = async () => {
    if (isExporting) return;
    
    const printArea = document.getElementById('print-area');
    if (!printArea) return;

    setIsExporting(true);
    
    const pagesDOM = Array.from(printArea.querySelectorAll('.page-container'));
    
    if (pagesDOM.length === 0) {
        setIsExporting(false);
        return;
    }

    try {
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      for (let i = 0; i < pagesDOM.length; i++) {
        const pageNode = pagesDOM[i] as HTMLElement;
        const canvas = await html2canvas(pageNode, {
          scale: 2, // Higher resolution
          useCORS: true,
          logging: false,
          scrollY: 0,
          scrollX: 0,
          backgroundColor: '#ffffff'
        });

        const imgData = canvas.toDataURL('image/jpeg', 1.0);
        
        // A4 size: 210 x 297 mm
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
      }

      pdf.save(`السعي_السنوي_${subject}_${stage}.pdf`);
    } catch (e) {
       console.error("PDF generation failed", e);
       alert("حدث خطأ أثناء إنشاء ملف PDF, يرجى المحاولة مرة أخرى.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans" dir="rtl">
      {/* Control Panel (Hidden on Print) */}
      <div className="print:hidden w-full bg-white shadow-sm border-b p-4 mb-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
            <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-800">
              <Settings className="w-6 h-6" />
              إعدادات القائمة وتفقيط الدرجات
            </h1>
            <div className="flex gap-2">
              <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md cursor-pointer hover:bg-blue-700 transition">
                <Upload className="w-4 h-4" />
                <span>رفع ملف (Excel / CSV)</span>
                <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} className="hidden" />
              </label>
              <button 
                onClick={() => setShowPreview(true)}
                className="flex items-center gap-2 px-5 py-2 bg-slate-800 text-white rounded-md hover:bg-slate-900 transition disabled:opacity-50 font-bold"
                disabled={students.length === 0}
              >
                <Printer className="w-4 h-4" />
                <span>معاينة للطباعة / التصدير</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-600">المعهد / الكلية</label>
              <input type="text" value={institute} onChange={e => setInstitute(e.target.value)} className="border rounded px-3 py-2" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-600">القسم الداخلي</label>
              <input type="text" value={department} onChange={e => setDepartment(e.target.value)} className="border rounded px-3 py-2" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-600">المرحلة</label>
              <select value={stage} onChange={e => setStage(e.target.value)} className="border rounded px-3 py-2 bg-white">
                <option value="الأولى">الأولى</option>
                <option value="الثانية">الثانية</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-600">المادة (السعي السنوي لمادة)</label>
              <input type="text" value={subject} onChange={e => setSubject(e.target.value)} className="border rounded px-3 py-2" placeholder="مثال: الرياضيات" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-600">الكورس</label>
              <select value={course} onChange={e => setCourse(e.target.value)} className="border rounded px-3 py-2 bg-white">
                <option value="الكورس الأول">الكورس الأول</option>
                <option value="الكورس الثاني">الكورس الثاني</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-600">العام الدراسي</label>
              <input type="text" value={academicYear} onChange={e => setAcademicYear(e.target.value)} className="border rounded px-3 py-2 text-right" dir="ltr" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-600">عدد الطلاب بالصفحة</label>
              <input type="number" value={rowsPerPage} onChange={e => setRowsPerPage(Math.max(1, parseInt(e.target.value) || 25))} className="border rounded px-3 py-2 text-right" dir="ltr" min="1" max="100" />
            </div>
          </div>
          
          {students.length === 0 && (
             <div className="mt-6 p-8 border-2 border-dashed border-gray-300 rounded-lg text-center text-gray-500">
               قم برفع ملف Excel يحتوي على قائمة الطلاب والدرجات.<br/>
               يفضل أن يحتوي الملف على الأعمدة بالشكل التالي:<br/>
               (الاسم | ن | ع | م | النشاط | السعي)
             </div>
          )}
        </div>
      </div>

      {/* Print Document Area */}
      {students.length > 0 && !showPreview && (
        <div className="p-4 md:p-8 flex flex-col items-center">
            <div className="bg-blue-50 text-blue-800 p-8 rounded-lg text-center max-w-2xl border border-blue-200">
               <h3 className="text-xl font-bold mb-2">تم تجهيز البيانات بنجاح!</h3>
               <p className="mb-4">تم تشكيل <strong>{pages.length}</strong> صفحات تقرير بناءً على عدد الطلاب (إجمالي {students.length} طالب).</p>
               <button 
                 onClick={() => setShowPreview(true)}
                 className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold shadow-lg transition-transform hover:scale-105"
               >
                 فتح شاشة معاينة الطباعة 🖨️
               </button>
            </div>
        </div>
      )}

      {students.length > 0 && showPreview && (
        <div className="fixed inset-0 z-50 bg-gray-200 flex flex-col font-sans overflow-x-hidden" dir="rtl">
          {/* Header */}
          <div className="w-full bg-slate-800 text-white p-4 shadow-[0_4px_15px_rgba(0,0,0,0.2)] flex flex-col md:flex-row justify-between items-center transition-all gap-4 print:hidden">
             <div className="flex gap-4">
               <button 
                 onClick={() => {
                   setShowPreview(false);
                   setTimeout(() => {
                     handlePrint();
                     setShowPreview(true);
                   }, 100);
                 }}
                 className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition font-bold disabled:opacity-50"
                 disabled={isExporting}
               >
                 <Printer className="w-5 h-5" />
                 <span>الطباعة (المتصفح)</span>
               </button>
               <button 
                 onClick={exportExcel}
                 className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition font-bold disabled:opacity-50"
                 disabled={isExporting}
               >
                 <Printer className={`w-5 h-5 ${isExporting ? 'animate-spin' : ''}`} />
                 <span>{isExporting ? 'جاري التحضير...' : 'تصدير كملف Excel'}</span>
               </button>
               <button 
                 onClick={async () => {
                   setShowPreview(false);
                   setIsExporting(true);
                   setTimeout(async () => {
                     await exportPDF();
                     setShowPreview(true);
                     setIsExporting(false);
                   }, 100);
                 }}
                 className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition font-bold disabled:opacity-50"
                 disabled={isExporting}
               >
                 <Printer className={`w-5 h-5 ${isExporting ? 'animate-spin' : ''}`} />
                 <span>{isExporting ? 'جاري التحضير...' : 'تصدير كمستند PDF'}</span>
               </button>
             </div>
             
             <h2 className="text-xl font-bold hidden md:block">شاشة معاينة التقرير النهائي ({pages.length} صفحات)</h2>
             
             <button 
               onClick={() => setShowPreview(false)}
               className="px-6 py-2 bg-slate-600 text-white rounded-md hover:bg-slate-500 transition font-bold"
               disabled={isExporting}
             >
               العودة للإعدادات
             </button>
          </div>

          <div id="print-area" className="flex-1 overflow-auto p-4 md:p-8 flex flex-col items-center gap-8 py-8 print:block print:overflow-visible print:bg-transparent print:p-0 print:gap-0 h-full">
            {pages.map((pageStudents, pageIndex) => (
              <div key={pageIndex} className="page-container w-[210mm] min-h-[297mm] shadow-2xl bg-white shrink-0 p-[10mm] flex flex-col justify-between snap-center print:w-full print:min-h-fit print:shadow-none print:p-0 print:border-none text-[14px]">
                
                <div>
                  <table className="w-full border-collapse border-[3px] border-black text-center font-bold">
                    <thead>
                      {/* Row 1: Header Top */}
                      <tr>
                        <th colSpan={3} className="border-[2px] border-black py-2 px-2 text-right">
                          المرحلة : {stage}
                        </th>
                        <th colSpan={3} className="border-[2px] border-black py-2 px-2 text-center text-xl">
                          السعي السنوي لمادة : {subject}
                        </th>
                        <th colSpan={2} className="border-[2px] border-black py-2 px-2 text-center">
                          {institute}
                        </th>
                      </tr>
                      {/* Row 2: Header Mid */}
                      <tr>
                        <th colSpan={3} className="border-[2px] border-black py-2 px-2">
                          {course} / العام الدراسي ( {academicYear} )
                        </th>
                        <th colSpan={5} className="border-[2px] border-black py-2 px-2">
                          {department}
                        </th>
                      </tr>
                      {/* Row 3: Table Column Headers */}
                      <tr>
                        <th rowSpan={2} className="border-[2px] border-black py-2 w-12 shrink-0">ت</th>
                        <th rowSpan={2} className="border-[2px] border-black py-2 min-w-[200px] w-1/3">الاسم الرباعي</th>
                        <th colSpan={3} className="border-[2px] border-black py-1">الدرجة</th>
                        <th rowSpan={2} className="border-[2px] border-black py-2 w-16 whitespace-pre-wrap leading-tight">
                          <div className="-rotate-90 md:rotate-0 tracking-tighter">النشاط<br/>%10</div>
                        </th>
                        <th rowSpan={2} className="border-[2px] border-black py-2 w-16 whitespace-pre-wrap leading-tight">
                          <div className="-rotate-90 md:rotate-0 tracking-tighter">السعي<br/>%40</div>
                        </th>
                        <th rowSpan={2} className="border-[2px] border-black py-2 w-32">السعي كتابة</th>
                      </tr>
                      {/* Row 4: Grade Sub-columns */}
                      <tr>
                        <th className="border-[2px] border-black py-1 w-10">ن</th>
                        <th className="border-[2px] border-black py-1 w-10">ع</th>
                        <th className="border-[2px] border-black py-1 w-10">م</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageStudents.map((student) => (
                        <tr key={student.id} className="break-inside-avoid">
                          <td className="border-[2px] border-black py-1 px-1">{student.id}</td>
                          <td className="border-[2px] border-black py-1 px-2 text-right">{student.name}</td>
                          <td className="border-[2px] border-black py-1 px-1">{student.n}</td>
                          <td className="border-[2px] border-black py-1 px-1">{student.a}</td>
                          <td className="border-[2px] border-black py-1 px-1">{student.m}</td>
                          <td className="border-[2px] border-black py-1 px-1">{student.activity}</td>
                          <td className="border-[2px] border-black py-1 px-1">{student.sa3y}</td>
                          <td className="border-[2px] border-black py-1 px-2 font-normal text-right">{student.text}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <div className="flex justify-between mt-8 pt-4 pb-2 font-bold select-none">
                  <div className="text-center">
                    <p>توقيع مدرس المادة</p>
                    <p className="mt-8">الاسم :</p>
                  </div>
                  <div className="text-center font-normal text-sm text-gray-500 mt-auto">
                    <p>الصفحة {pageIndex + 1} من {pages.length}</p>
                  </div>
                  <div className="text-center">
                    <p>رئيس القسم</p>
                    <p className="mt-8">الاسم :</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

