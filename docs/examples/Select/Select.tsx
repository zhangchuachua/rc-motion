/**
 * debug: true
 */
import React, { useState } from 'react';
import classnames from 'classnames/bind';
import CSSMotion from 'rc-motion';
import styles from './Select.module.scss';
import './select-transition.scss';

const cx = classnames.bind(styles);
const langMap = {
  en: 'English',
  tw: '中文繁体',
  jp: '日语',
}

const Select = ({}) => {
  const [open, setOpen] = useState(false);
  const handleClick = () => {
    setOpen(prev => !prev);
  }
  return (
    <div>
      <button onClick={handleClick} className={cx('btn')}>
        click
      </button>
      <CSSMotion visible={open} motionName="select-fade">
        {
          ({ className, style }) => {
            return <ul className={cx(className, 'panel')} style={style}>
              {
                Object.entries(langMap).map(([key, value]) => {
                  return <li key={key} data-lang={key}>{value}</li>
                })
              }
            </ul>
          }
        }
      </CSSMotion>
    </div>
  );
};

export default Select;