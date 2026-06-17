import React, { useState, useRef } from 'react';
import { Upload, File, CheckCircle, AlertCircle, AlertTriangle, Download } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Alert } from '../ui/Alert';
import { apiService } from '../../services/api';

interface FileUploadProps {
  onUploadSuccess?: (result: any) => void;
  onUploadError?: (error: string) => void;
  accept?: string;
  maxSize?: number; // in MB
  className?: string;
}

interface ImportWarning {
  type: 'duplicate' | 'outlier' | 'spend-double-count';
  rows: number[];
  message: string;
}

interface ValidationResult {
  valid: boolean;
  rowCount: number;
  errors: string[];
  warnings?: ImportWarning[];
  preview: any[];
}

const WARNING_LABEL: Record<string, string> = {
  duplicate: 'Possible duplicate',
  outlier: 'Outlier vs prior period',
  'spend-double-count': 'Spend double-counting risk',
};

export const FileUpload: React.FC<FileUploadProps> = ({
  onUploadSuccess,
  onUploadError,
  accept = '.csv',
  maxSize = 10,
  className = '',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [importResult, setImportResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelection(files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelection(files[0]);
    }
  };

  const handleFileSelection = (file: File) => {
    // Validate file type
    if (!file.name.toLowerCase().endsWith('.csv')) {
      onUploadError?.('Please select a CSV file');
      return;
    }

    // Validate file size
    if (file.size > maxSize * 1024 * 1024) {
      onUploadError?.(`File size must be less than ${maxSize}MB`);
      return;
    }

    setSelectedFile(file);
    setValidation(null);
    setImportResult(null);
  };

  const validateFile = async () => {
    if (!selectedFile) return;
  
    setValidating(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      // Must go through postForm so the multipart Content-Type (with boundary) is
      // set — apiService.post forces application/json, which makes multer see no file.
      const response = await apiService.postForm('/csv/validate', formData);

      setValidation((response.data as { validation: ValidationResult }).validation);
    } catch (error: any) {
      onUploadError?.(error.response?.data?.message || 'Validation failed');
    } finally {
      setValidating(false);
    }
    };

    const importFile = async () => {
        if (!selectedFile || !validation?.valid) return;
      
        setImporting(true);
        try {
          const formData = new FormData();
          formData.append('file', selectedFile);

          const response = await apiService.postForm('/csv/import', formData);

          setImportResult((response.data as { result: any }).result);
          onUploadSuccess?.((response.data as { result: any }).result);
        } catch (error: any) {
          onUploadError?.(error.response?.data?.message || 'Import failed');
        } finally {
          setImporting(false);
        }
      };

  const downloadTemplate = async () => {
    try {
      const response = await apiService.get('/csv/template');

      const url = window.URL.createObjectURL(new Blob([response.data as BlobPart]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'carbonytics_import_template.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      onUploadError?.('Failed to download template');
    }
  };

  const resetUpload = () => {
    setSelectedFile(null);
    setValidation(null);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Template Download */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-fg">Import Template</h3>
            <p className="text-sm text-muted">
              Download the CSV template to see the required format
            </p>
          </div>
          <Button
            variant="outline"
            onClick={downloadTemplate}
            className="flex items-center space-x-2"
          >
            <Download className="w-4 h-4" />
            <span>Download Template</span>
          </Button>
        </div>
      </Card>

      {/* File Upload Area */}
      <Card className="p-6">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragging
              ? 'border-primary-500 bg-primary-50'
              : 'border-line hover:border-line'
          }`}
        >
          <Upload className="w-12 h-12 text-muted mx-auto mb-4" />
          
          {selectedFile ? (
            <div className="space-y-2">
              <div className="flex items-center justify-center space-x-2">
                <File className="w-5 h-5 text-green-500" />
                <span className="font-medium text-fg">{selectedFile.name}</span>
              </div>
              <p className="text-sm text-muted">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetUpload}
                className="text-muted"
              >
                Choose different file
              </Button>
            </div>
          ) : (
            <>
              <h3 className="text-lg font-medium text-fg mb-2">
                Upload CSV File
              </h3>
              <p className="text-muted mb-4">
                Drag and drop your CSV file here, or click to browse
              </p>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                Choose File
              </Button>
            </>
          )}
          
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            onChange={handleFileInput}
            className="hidden"
          />
        </div>

        {selectedFile && !validation && (
          <div className="mt-4 flex justify-center">
            <Button
              onClick={validateFile}
              loading={validating}
              disabled={validating}
            >
              {validating ? 'Validating...' : 'Validate File'}
            </Button>
          </div>
        )}
      </Card>

      {/* Validation Results */}
      {validation && (
        <Card className="p-6">
          <h3 className="font-medium text-fg mb-4">Validation Results</h3>
          
          {validation.valid ? (
            <Alert variant="success" className="mb-4">
              <CheckCircle className="w-4 h-4" />
              <span>File validation passed! Ready to import {validation.rowCount} rows.</span>
            </Alert>
          ) : (
            <Alert variant="error" className="mb-4">
              <AlertCircle className="w-4 h-4" />
              <span>File validation failed. Please fix the errors below.</span>
            </Alert>
          )}

          {validation.errors.length > 0 && (
            <div className="mb-4">
              <h4 className="font-medium text-red-900 mb-2">Errors:</h4>
              <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
                {validation.errors.map((error, index) => (
                  <li key={index}>• {error}</li>
                ))}
              </ul>
            </div>
          )}

          {validation.warnings && validation.warnings.length > 0 && (
            <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/25">
              <h4 className="font-medium text-amber-800 dark:text-amber-300 mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                Data-quality warnings ({validation.warnings.length}) — advisory, you can still import
              </h4>
              <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1.5">
                {validation.warnings.map((w, index) => (
                  <li key={index}>
                    <span className="font-medium">{WARNING_LABEL[w.type] || w.type}:</span> {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {validation.preview.length > 0 && (
            <div className="mb-4">
              <h4 className="font-medium text-fg mb-2">Preview (first 3 rows):</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs border">
                  <thead className="bg-fg/[0.04]">
                    <tr>
                      {Object.keys(validation.preview[0]).map(key => (
                        <th key={key} className="px-2 py-1 border text-left font-medium">
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {validation.preview.slice(0, 3).map((row, index) => (
                      <tr key={index} className="border-t">
                        {Object.values(row).map((value: any, cellIndex) => (
                          <td key={cellIndex} className="px-2 py-1 border">
                            {value?.toString() || ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {validation.valid && (
            <div className="flex justify-center">
              <Button
                onClick={importFile}
                loading={importing}
                disabled={importing}
                className="bg-green-600 hover:bg-green-700"
              >
                {importing ? 'Importing...' : 'Import Data'}
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Import Results */}
      {importResult && (
        <Card className="p-6">
          <h3 className="font-medium text-fg mb-4">Import Results</h3>
          
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{importResult.processed}</div>
              <div className="text-sm text-muted">Processed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{importResult.successful}</div>
              <div className="text-sm text-muted">Successful</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">{importResult.failed}</div>
              <div className="text-sm text-muted">Failed</div>
            </div>
          </div>

          {importResult.successful > 0 && (
            <Alert variant="success" className="mb-4">
              <CheckCircle className="w-4 h-4" />
              <span>Successfully imported {importResult.successful} calculations!</span>
            </Alert>
          )}

          {importResult.errors && importResult.errors.length > 0 && (
            <div>
              <h4 className="font-medium text-red-900 mb-2">Import Errors:</h4>
              <div className="max-h-32 overflow-y-auto">
                <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
                  {importResult.errors.slice(0, 10).map((error: any, index: number) => (
                    <li key={index}>
                      Row {error.row}: {error.error}
                    </li>
                  ))}
                  {importResult.errors.length > 10 && (
                    <li className="text-muted">
                      ... and {importResult.errors.length - 10} more errors
                    </li>
                  )}
                </ul>
              </div>
            </div>
          )}

          <div className="mt-4 flex justify-center">
            <Button onClick={resetUpload} variant="outline">
              Import Another File
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};