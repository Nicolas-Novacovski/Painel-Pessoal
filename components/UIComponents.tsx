import React, { useState, useEffect } from 'react';
import { StarIcon, StarHalfIcon } from './Icons';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1000] flex justify-center items-center p-4" onClick={onClose}>
      <div style={{animation: 'modal-fade-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)'}} className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 md:p-8 border-b border-gray-200">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-dark">{title}</h2>
                <button onClick={onClose} className="text-gray-400 hover:text-dark transition-colors p-1 rounded-full hover:bg-gray-100">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
        </div>
        <div className="p-6 md:p-8">
            {children}
        </div>
      </div>
    </div>
  );
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'accent' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  justify?: 'center' | 'start';
  children: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ children, className, variant = 'primary', size='md', justify = 'center', ...props }, ref) => {
    const baseClasses = "font-semibold transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg active:scale-95";
    
    const sizeClasses = {
        sm: 'px-3 py-1.5 text-sm',
        md: 'px-4 py-2 text-base',
        lg: 'px-6 py-3 text-lg w-full'
    };

    const justifyClasses = {
        center: 'justify-center',
        start: 'justify-start'
    };

    const variantClasses = {
        primary: 'bg-primary text-white hover:bg-primary-focus focus:ring-primary shadow-sm hover:shadow-md',
        accent: 'bg-accent text-white hover:bg-accent-focus focus:ring-accent shadow-sm hover:shadow-md',
        secondary: 'bg-slate-200 text-slate-800 hover:bg-slate-300 focus:ring-primary',
        danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 shadow-sm hover:shadow-md',
        ghost: 'text-slate-600 hover:bg-slate-200 hover:text-dark focus:ring-primary',
    }
    
    return (
        <button ref={ref} className={`${baseClasses} ${sizeClasses[size]} ${justifyClasses[justify]} ${variantClasses[variant]} ${className}`} {...props}>
            {children}
        </button>
    );
});
Button.displayName = "Button";


interface StarRatingInputProps {
  rating: number;
  setRating: (rating: number) => void;
}

export const StarRatingInput: React.FC<StarRatingInputProps> = ({ rating, setRating }) => {
    const [hoverRating, setHoverRating] = useState(0);
    const displayRating = hoverRating || rating;

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>, index: number) => {
        const starElement = e.currentTarget;
        const rect = starElement.getBoundingClientRect();
        const isHalf = e.clientX - rect.left <= rect.width / 2;
        setHoverRating(index + (isHalf ? 0.5 : 1));
    };

    const handleMouseLeave = () => {
        setHoverRating(0);
    };

    const handleClick = () => {
        if (hoverRating === rating) {
            setRating(0);
            setHoverRating(0);
        } else {
            setRating(hoverRating);
        }
    };

    return (
        <div className="flex items-center space-x-1" onMouseLeave={handleMouseLeave}>
            {[...Array(5)].map((_, i) => {
                const starValue = i + 1;
                let star;

                if (displayRating >= starValue) { // Full star
                    star = <StarIcon className="w-8 h-8 text-yellow-400" />;
                } else if (displayRating >= starValue - 0.5) { // Half star
                    star = (
                        <div className="relative w-8 h-8">
                            <StarIcon className="w-8 h-8 text-gray-300 absolute top-0 left-0" />
                            <StarHalfIcon className="w-8 h-8 text-yellow-400 absolute top-0 left-0" />
                        </div>
                    );
                } else { // Empty star
                    star = <StarIcon className="w-8 h-8 text-gray-300" />;
                }
                
                return (
                    <div
                        key={i}
                        className="cursor-pointer transition-all duration-150 transform hover:scale-110"
                        onMouseMove={(e) => handleMouseMove(e, i)}
                        onClick={handleClick}
                    >
                       {star}
                    </div>
                );
            })}
        </div>
    );
};

interface StarRatingDisplayProps {
  rating: number;
  className?: string;
}

export const StarRatingDisplay: React.FC<StarRatingDisplayProps> = ({ rating, className }) => {
    return (
        <div className={`flex items-center ${className}`}>
            {[...Array(5)].map((_, i) => {
                const starValue = i + 1;
                
                if (rating >= starValue) {
                    // Full star
                    return <StarIcon key={i} className="w-4 h-4 text-yellow-400" />;
                } 
                if (rating >= starValue - 0.5) {
                    // Half star
                    return (
                         <div key={i} className="relative w-4 h-4">
                            <StarIcon className="w-4 h-4 text-gray-300 absolute top-0 left-0" />
                            <StarHalfIcon className="w-4 h-4 text-yellow-400 absolute top-0 left-0" />
                        </div>
                    );
                }
                // Empty star
                return <StarIcon key={i} className="w-4 h-4 text-gray-300" />;
            })}
        </div>
    );
};

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => {
    return (
        <input 
            ref={ref}
            className={`w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition text-slate-900 placeholder:text-slate-400 ${className}`} 
            {...props}
        />
    )
});
Input.displayName = "Input";

export const CurrencyInput: React.FC<{
    value: number;
    onValueChange: (value: number) => void;
    placeholder?: string;
    className?: string;
    id?: string;
    disabled?: boolean;
}> = ({ value, onValueChange, placeholder, className, id, disabled }) => {
    const [displayValue, setDisplayValue] = useState('');

    useEffect(() => {
        // Only update display value from parent if the input is not focused
        // to avoid disrupting user typing.
        if (document.activeElement?.id !== id) {
            const formatted = new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL',
            }).format(value || 0);
            setDisplayValue(formatted);
        }
    }, [value, id]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value;
        const numericValue = rawValue.replace(/\D/g, ''); // Remove all non-digit characters

        if (numericValue === '') {
            setDisplayValue('');
            onValueChange(0);
            return;
        }

        const numberValue = parseFloat(numericValue) / 100;
        onValueChange(numberValue);

        // We update the display value directly to allow for smooth typing
        const formatted = new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        }).format(numberValue);
        setDisplayValue(formatted);
    };
    
    const handleBlur = () => {
        // On blur, format the value from the parent state to ensure consistency
        const formatted = new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        }).format(value || 0);
        setDisplayValue(formatted);
    };

    return (
        <Input
            id={id}
            type="text" // Use text to allow currency symbols and formatting
            inputMode="decimal" // Better for mobile keyboards
            value={displayValue}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder={placeholder}
            className={className}
            disabled={disabled}
        />
    );
};


interface SegmentedControlProps<T extends string> {
    options: { label: string; value: T }[];
    value: T;
    onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
    return (
        <div className="flex space-x-1 bg-slate-200 p-1 rounded-lg">
            {options.map((option) => (
                <button
                    key={option.value}
                    onClick={() => onChange(option.value)}
                    className={`w-full text-center px-4 py-1.5 text-sm font-semibold rounded-md transition-colors duration-200 ${
                        value === option.value
                            ? 'bg-white text-primary shadow-sm'
                            : 'text-slate-600 hover:bg-slate-300/50'
                    }`}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

// --- Price Rating Components ---

interface PriceRatingDisplayProps {
  rating: number;
  className?: string;
}

export const PriceRatingDisplay: React.FC<PriceRatingDisplayProps> = ({ rating, className }) => {
    if (!rating || rating === 0) return null;
    return (
        <div className={`flex items-center gap-0.5 ${className}`}>
            {[...Array(4)].map((_, i) => (
                <span key={i} className={`font-bold ${i < rating ? 'text-green-600' : 'text-slate-300'}`}>$</span>
            ))}
        </div>
    );
};

interface PriceRatingInputProps {
  rating: number;
  setRating: (rating: number) => void;
}

export const PriceRatingInput: React.FC<PriceRatingInputProps> = ({ rating, setRating }) => {
    return (
        <div className="flex items-center space-x-2">
            {[1, 2, 3, 4].map((level) => (
                <button
                    type="button"
                    key={level}
                    onClick={() => setRating(level === rating ? 0 : level)}
                    aria-label={`Definir preço como ${level} de 4`}
                    className={`text-2xl font-bold cursor-pointer transition-all duration-150 transform hover:scale-110 ${
                        level <= rating ? 'text-green-500' : 'text-gray-300 hover:text-green-400'
                    }`}
                >
                    $
                </button>
            ))}
        </div>
    );
};