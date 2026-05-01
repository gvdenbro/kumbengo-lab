;nyquist plug-in
;version 4
;type tool
;name "Select Slice"
;author "Kumbengo Lab"
;release 1.0

(setf labels (second (first (aud-get-info "Labels"))))
(setf sel-start (get '*selection* 'start))
(setf sel-end (get '*selection* 'end))
(setf now (if (> sel-end sel-start)
              (/ (+ sel-start sel-end) 2.0)
              sel-start))

(defun select-region (start end)
  (aud-do (format nil "Select:Start=~a End=~a Mode=Set" start end))
  (aud-do "PlaySelectedRegion:")
  "")

(defun get-label-time (i)
  (first (nth i labels)))

(defun find-next-label-index ()
  (do ((j 0 (1+ j)))
      ((or (>= j (length labels))
           (> (get-label-time j) now))
       j)))

(cond
  ((< (length labels) 1)
   "No labels found.")
  (t
   (let ((idx (find-next-label-index)))
     (let ((start (if (> idx 0) (get-label-time (1- idx)) 0))
           (end (if (< idx (length labels))
                    (get-label-time idx)
                    99999)))
       (select-region start end)))))
